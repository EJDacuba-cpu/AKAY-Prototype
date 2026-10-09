<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/** What a consultation decides for the existing monitoring it followed (Care Plan & Next Steps). */
class CarePlanFollowedConditionTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Followed RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Followed BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->patient = Patient::create(['first_name' => 'Followed', 'last_name' => 'One', 'sex' => 'Female', 'barangay_health_center_id' => $this->bhc->id]);
        $this->actingAs($this->user(ActionPermissions::PRESETS['clinical']), 'sanctum');
    }

    private function user(array $permissions): User
    {
        return User::create(['name' => 'Followed BHW '.Str::random(4), 'email' => Str::random(8).'@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $this->bhc->id, 'permissions' => $permissions]);
    }

    private function save(array $diagnoses, array $carePlan = [], array $extra = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Check-up',
            'diagnosis' => implode('; ', array_column($diagnoses, 'name')),
            'diagnoses' => $diagnoses,
            'care_plan' => $carePlan,
            ...$extra,
        ]);
    }

    private function referral(): array
    {
        return [
            'needs_referral' => true,
            'referral' => ['reason_for_referral' => 'Referred for: Hypertension', 'urgency_level' => 'Routine'],
        ];
    }

    private function followedHypertension(): ConditionMonitoring
    {
        // Continued (legacy) monitoring: no consultation concern starts it any more.
        $record = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->bhc->id]);
        $monitoring = ConditionMonitoring::create(['patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id, 'condition_key' => 'hypertension', 'condition_name' => 'Hypertension', 'condition_identity' => 'hypertension', 'status' => 'active', 'started_health_record_id' => $record->id, 'started_at' => now()->subWeek()]);
        $monitoring->visits()->create(['health_record_id' => $record->id, 'action' => 'started', 'referred' => false, 'created_at' => now()]);

        return $monitoring;
    }

    public function test_a_followed_condition_can_be_referred_without_a_new_diagnosis(): void
    {
        $monitoring = $this->followedHypertension();

        $id = $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_referrals' => [$monitoring->id],
        ], $this->referral())->assertCreated()->json('data.id');

        $this->assertSame('active', $monitoring->fresh()->status, 'a referral never ends BHC monitoring');
        $visit = $monitoring->visits()->where('health_record_id', $id)->sole();
        $this->assertSame('continued', $visit->action);
        $this->assertTrue($visit->referred);
        $this->assertTrue(HealthRecord::findOrFail($id)->needs_referral, 'the visit carries the referral (a hold while no RHU doctor is available)');
    }

    public function test_a_followed_condition_that_is_not_referred_is_not_marked_referred(): void
    {
        $monitoring = $this->followedHypertension();

        $id = $this->save([], ['continued_monitoring_ids' => [$monitoring->id]])->assertCreated()->json('data.id');

        $this->assertFalse($monitoring->visits()->where('health_record_id', $id)->sole()->referred);
    }

    public function test_referring_a_followed_condition_needs_a_referral(): void
    {
        $monitoring = $this->followedHypertension();
        $before = HealthRecord::count();

        $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_referrals' => [$monitoring->id],
        ])->assertUnprocessable()->assertJsonValidationErrors(['needs_referral']);

        $this->assertSame($before, HealthRecord::count());
    }

    public function test_only_a_continued_and_not_stopped_condition_can_be_referred(): void
    {
        $monitoring = $this->followedHypertension();

        $this->save([], ['monitoring_referrals' => [$monitoring->id]], $this->referral())
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_referrals.0']);

        $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_referrals' => [$monitoring->id],
            'monitoring_stops' => [['monitoring_id' => $monitoring->id, 'reason' => 'Moved away']],
        ], $this->referral())->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_referrals.0']);
    }
}
