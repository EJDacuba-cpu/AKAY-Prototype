<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\Referral;
use App\Models\ReferralHold;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use App\Services\StaffRoles;
use Tests\TestCase;

/**
 * One referral may cover several items (referred concerns plus referred
 * monitored conditions). The worker must say so explicitly, the server
 * enforces it, and the confirmation is audited. It is not a clinical check.
 */
class SharedReferralAcknowledgmentTest extends TestCase
{
    use RefreshDatabase;

    private const MESSAGE = 'Confirm that all listed concerns can go to this facility with this priority, or change the care plan.';

    private Patient $patient;

    private User $user;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Shared RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Shared BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->user = User::create(['name' => 'Shared BHW', 'email' => 'shared@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHC, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $this->bhc->id, 'permissions' => StaffRoles::defaults('midwife')]);
        $this->patient = Patient::create(['first_name' => 'Shared', 'last_name' => 'Referral', 'sex' => 'Female', 'barangay_health_center_id' => $this->bhc->id]);
        $this->actingAs($this->user, 'sanctum');
    }

    private function save(array $diagnoses, array $extra = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Dizziness',
            'diagnosis' => implode('; ', array_column($diagnoses, 'name')),
            'diagnoses' => $diagnoses,
            'needs_referral' => true,
            'referral' => ['reason_for_referral' => 'Needs RHU review', 'urgency_level' => 'Routine'],
            ...$extra,
        ]);
    }

    private function twoReferred(): array
    {
        return [
            ['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'refer'],
            ['id' => 'd2', 'name' => 'Diabetes', 'carePlan' => 'refer'],
        ];
    }

    /** An RHU-confirmed, linked (not legacy) BHC monitoring. */
    private function verifiedMonitoring(): ConditionMonitoring
    {
        $condition = PatientCondition::create([
            'patient_id' => $this->patient->id,
            'condition_name' => 'Asthma',
            'condition_identity' => 'name:asthma',
            'status' => 'active',
            'confirmed_at' => now(),
            'source_type' => PatientCondition::SOURCE_RHU_RECORD,
            'source_id' => 1,
        ]);
        $record = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->bhc->id]);
        $monitoring = ConditionMonitoring::create([
            'patient_id' => $this->patient->id,
            'patient_condition_id' => $condition->id,
            'barangay_health_center_id' => $this->bhc->id,
            'condition_key' => null,
            'condition_name' => 'Asthma',
            'condition_identity' => 'name:asthma',
            'status' => 'active',
            'started_health_record_id' => $record->id,
            'started_at' => now()->subWeek(),
        ]);
        $monitoring->visits()->create(['health_record_id' => $record->id, 'action' => 'started', 'referred' => false, 'created_at' => now()]);

        return $monitoring;
    }

    private function acknowledgments()
    {
        return AuditLog::where('module', 'referrals')->where('action', 'acknowledged');
    }

    public function test_one_item_referral_needs_no_acknowledgment(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'refer']])->assertCreated();

        $this->assertSame(1, Referral::count() + ReferralHold::count());
        $this->assertSame(0, $this->acknowledgments()->count());
    }

    public function test_two_referred_concerns_need_acknowledgment(): void
    {
        $this->save($this->twoReferred())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['care_plan.shared_referral_acknowledged' => self::MESSAGE]);
        $this->save($this->twoReferred(), ['care_plan' => ['shared_referral_acknowledged' => false]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['care_plan.shared_referral_acknowledged' => self::MESSAGE]);
        $this->assertSame(0, HealthRecord::count());

        $this->save($this->twoReferred(), ['care_plan' => ['shared_referral_acknowledged' => true]])->assertCreated();

        $this->assertSame(1, Referral::count() + ReferralHold::count());
        $audit = $this->acknowledgments()->sole();
        $this->assertSame($this->user->id, $audit->user_id);
        $this->assertStringContainsString('Hypertension', $audit->description);
        $this->assertStringContainsString('Diabetes', $audit->description);
        $this->assertStringContainsString('2 items', $audit->description);
        $this->assertStringContainsString('Not a clinical compatibility check.', $audit->description);
    }

    public function test_concern_plus_monitoring_referral_needs_acknowledgment(): void
    {
        $monitoring = $this->verifiedMonitoring();
        $carePlan = ['continued_monitoring_ids' => [$monitoring->id], 'monitoring_referrals' => [$monitoring->id]];
        $concern = [['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'refer']];

        $this->save($concern, ['care_plan' => $carePlan])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['care_plan.shared_referral_acknowledged' => self::MESSAGE]);

        $this->save($concern, ['care_plan' => [...$carePlan, 'shared_referral_acknowledged' => true]])->assertCreated();
        $this->assertSame(1, $this->acknowledgments()->count());
        $this->assertStringContainsString('Asthma', $this->acknowledgments()->sole()->description);
    }

    public function test_blocked_referral_hold_is_still_audited(): void
    {
        $this->save($this->twoReferred(), ['care_plan' => ['shared_referral_acknowledged' => true]])->assertCreated();

        $this->assertSame(1, ReferralHold::count());
        $this->assertSame(0, Referral::count());
        $this->assertSame(1, $this->acknowledgments()->count());
    }
}
