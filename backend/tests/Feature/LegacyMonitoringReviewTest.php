<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\ConditionMonitoringVisit;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use App\Services\ClinicalRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use App\Services\StaffRoles;
use Tests\TestCase;

/** The RHU reconciles Legacy BHC Monitoring: verify it (by confirming the condition) or discontinue it. */
class LegacyMonitoringReviewTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $rhuUser;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Legacy RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Legacy BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->rhuUser = $this->user('rhu@example.test', [
            'role' => User::ROLE_RHU,
            'rural_health_unit_id' => $this->rhu->id,
            'permissions' => [...StaffRoles::defaults('midwife'), 'rhu.manage', 'conditions.confirm'],
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Legacy', 'last_name' => 'Patient', 'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id, 'rural_health_unit_id' => $this->rhu->id,
        ]);
    }

    private function user(string $email, array $attributes): User
    {
        return User::create([...['name' => $email, 'email' => $email, 'password' => bcrypt('test-password'), 'status' => User::STATUS_ACTIVE], ...$attributes]);
    }

    private function legacy(?Patient $patient = null, string $name = 'Hypertension'): ConditionMonitoring
    {
        $patient ??= $this->patient;
        $registry = app(ClinicalRegistry::class);
        $key = $registry->matchCondition($name)['key'] ?? null;
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->bhc->id]);
        $monitoring = ConditionMonitoring::create([
            'patient_id' => $patient->id, 'patient_condition_id' => null, 'barangay_health_center_id' => $this->bhc->id,
            'condition_key' => $key, 'condition_name' => $name, 'condition_identity' => $registry->conditionIdentity($key, $name),
            'status' => 'active', 'started_health_record_id' => $record->id, 'started_at' => now()->subWeek(),
        ]);
        $monitoring->visits()->create(['health_record_id' => $record->id, 'action' => 'started', 'referred' => false, 'created_at' => now()]);

        return $monitoring;
    }

    private function referral(): Referral
    {
        return Referral::create([
            'tracking_id' => 'AKAY-LEGACY-'.Str::random(6),
            'qr_code_value' => 'AKAY:LEGACY:'.Str::random(6),
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $this->rhuUser->id,
            'reason_for_referral' => 'Legacy review test.',
            'referral_datetime' => now()->addDay(),
            'status' => Referral::STATUS_RECEIVED,
        ]);
    }

    private function feedbackPost(User $user, array $overrides = [])
    {
        return $this->actingAs($user, 'sanctum')->postJson('/api/feedback', [
            'referral_id' => $this->referral()->id,
            'rhu_diagnosis' => 'Hypertension',
            ...$overrides,
        ]);
    }

    private function recordPost(User $user, array $overrides = [])
    {
        return $this->actingAs($user, 'sanctum')
            ->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
            ->postJson('/api/health-records', [
                'patient_id' => $this->patient->id,
                'date_recorded' => '2026-07-19 09:30:00',
                'category' => 'General Consultation',
                'chief_complaint' => 'Routine consultation',
                ...$overrides,
            ]);
    }

    public function test_feedback_discontinues_a_legacy_monitoring_with_audit(): void
    {
        $monitoring = $this->legacy();

        $this->feedbackPost($this->rhuUser, [
            'legacy_monitoring_discontinuations' => [['monitoring_id' => $monitoring->id, 'reason' => 'Never confirmed by RHU']],
        ])->assertCreated();

        $monitoring->refresh();
        $this->assertSame('stopped', $monitoring->status);
        $this->assertStringStartsWith('RHU review:', $monitoring->stop_reason);
        $this->assertNotNull($monitoring->stopped_at);
        $this->assertNull($monitoring->stopped_health_record_id);
        $this->assertSame($this->rhuUser->id, $monitoring->updated_by);
        $this->assertSame(0, ConditionMonitoringVisit::where('action', 'stopped')->count());

        $audit = AuditLog::where('action', 'discontinued')->sole();
        $this->assertSame($this->rhuUser->id, $audit->user_id);
        $this->assertSame('condition_monitorings', $audit->module);
        $this->assertNotNull($audit->created_at);
        foreach (['Hypertension', 'active', 'stopped', 'Never confirmed by RHU', (string) $monitoring->id] as $needle) {
            $this->assertStringContainsString($needle, $audit->description);
        }
    }

    public function test_rhu_record_discontinuation_writes_a_visit_row(): void
    {
        $monitoring = $this->legacy();

        $recordId = $this->recordPost($this->rhuUser, [
            'legacy_monitoring_discontinuations' => [['monitoring_id' => $monitoring->id, 'reason' => 'Not a monitored case']],
        ])->assertCreated()->json('data.id');

        $monitoring->refresh();
        $this->assertSame('stopped', $monitoring->status);
        $this->assertSame($recordId, $monitoring->stopped_health_record_id);
        $visit = ConditionMonitoringVisit::where('action', 'stopped')->sole();
        $this->assertSame($monitoring->id, $visit->condition_monitoring_id);
        $this->assertSame($recordId, $visit->health_record_id);
        $this->assertSame(1, AuditLog::where('action', 'discontinued')->count());
    }

    public function test_confirm_same_identity_links_and_audits_verification(): void
    {
        $monitoring = $this->legacy();

        $this->feedbackPost($this->rhuUser, [
            'condition_confirmations' => [['name' => 'Hypertension', 'status' => 'active']],
        ])->assertCreated();

        $condition = PatientCondition::where('patient_id', $this->patient->id)->sole();
        $this->assertSame($condition->id, $monitoring->fresh()->patient_condition_id);
        $this->assertSame('active', $monitoring->fresh()->status);

        $audit = AuditLog::where('action', 'verified')->sole();
        $this->assertSame($this->rhuUser->id, $audit->user_id);
        $this->assertSame('condition_monitorings', $audit->module);
        $this->assertStringContainsString("Legacy BHC monitoring {$monitoring->id} (Hypertension) verified by RHU: linked to condition {$condition->id}. Condition status: none -> active.", $audit->description);
    }

    public function test_discontinue_runs_before_confirm_so_the_row_is_not_linked(): void
    {
        $monitoring = $this->legacy();

        $this->feedbackPost($this->rhuUser, [
            'legacy_monitoring_discontinuations' => [['monitoring_id' => $monitoring->id, 'reason' => 'Stop it']],
            'condition_confirmations' => [['name' => 'Hypertension', 'status' => 'active']],
        ])->assertCreated();

        $monitoring->refresh();
        $this->assertSame('stopped', $monitoring->status);
        $this->assertNull($monitoring->patient_condition_id);
        $this->assertSame(1, PatientCondition::where('patient_id', $this->patient->id)->count());
        $this->assertSame(0, AuditLog::where('action', 'verified')->count());
        $this->assertSame(1, AuditLog::where('action', 'discontinued')->count());
    }

    public function test_discontinuation_needs_a_reason(): void
    {
        $monitoring = $this->legacy();

        $this->feedbackPost($this->rhuUser, [
            'legacy_monitoring_discontinuations' => [['monitoring_id' => $monitoring->id, 'reason' => '   ']],
        ])->assertUnprocessable()->assertJsonValidationErrors('legacy_monitoring_discontinuations.0.reason');

        $this->assertSame('active', $monitoring->fresh()->status);
    }

    public function test_reason_must_fit_the_stop_reason_column_with_its_prefix(): void
    {
        $monitoring = $this->legacy();

        $this->feedbackPost($this->rhuUser, [
            'legacy_monitoring_discontinuations' => [['monitoring_id' => $monitoring->id, 'reason' => str_repeat('a', 489)]],
        ])->assertUnprocessable()->assertJsonValidationErrors('legacy_monitoring_discontinuations.0.reason');

        $this->feedbackPost($this->rhuUser, [
            'legacy_monitoring_discontinuations' => [['monitoring_id' => $monitoring->id, 'reason' => str_repeat('a', 488)]],
        ])->assertCreated();
        $this->assertSame(500, strlen($monitoring->fresh()->stop_reason));
    }

    public function test_verified_or_other_patients_monitoring_is_rejected(): void
    {
        $other = Patient::create(['first_name' => 'Other', 'last_name' => 'Patient', 'sex' => 'Male', 'barangay_health_center_id' => $this->bhc->id]);
        $foreign = $this->legacy($other);
        $condition = PatientCondition::create([
            'patient_id' => $this->patient->id, 'condition_name' => 'Hypertension', 'condition_identity' => 'hypertension',
            'status' => 'active', 'confirmed_at' => now(), 'source_type' => PatientCondition::SOURCE_RHU_RECORD, 'source_id' => 1,
        ]);
        $verified = $this->legacy();
        $verified->update(['patient_condition_id' => $condition->id]);

        foreach ([$foreign, $verified] as $row) {
            $this->feedbackPost($this->rhuUser, [
                'legacy_monitoring_discontinuations' => [['monitoring_id' => $row->id, 'reason' => 'No']],
            ])->assertUnprocessable()->assertJsonValidationErrors('legacy_monitoring_discontinuations.0.monitoring_id');
            $this->assertSame('active', $row->fresh()->status);
        }
        $this->assertSame(0, AuditLog::where('action', 'discontinued')->count());
    }

    public function test_bhc_user_cannot_discontinue(): void
    {
        $monitoring = $this->legacy();
        $bhw = $this->user('bhw@example.test', [
            'role' => User::ROLE_BHC,
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => StaffRoles::defaults('midwife'),
        ]);

        $this->recordPost($bhw, [
            'legacy_monitoring_discontinuations' => [['monitoring_id' => $monitoring->id, 'reason' => 'Nope']],
        ])->assertForbidden();

        $monitoring->refresh();
        $this->assertSame('active', $monitoring->status);
        $this->assertNull($monitoring->stop_reason);
        $this->assertSame(0, AuditLog::where('action', 'discontinued')->count());
    }

    public function test_history_is_kept(): void
    {
        $monitoring = $this->legacy();
        $startedRecord = $monitoring->started_health_record_id;

        $recordId = $this->recordPost($this->rhuUser, [
            'legacy_monitoring_discontinuations' => [['monitoring_id' => $monitoring->id, 'reason' => 'Housekeeping']],
        ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('condition_monitorings', ['id' => $monitoring->id]);
        $this->assertSame($startedRecord, $monitoring->fresh()->started_health_record_id);
        $this->assertDatabaseHas('condition_monitoring_visits', ['condition_monitoring_id' => $monitoring->id, 'health_record_id' => $startedRecord, 'action' => 'started']);
        $this->assertSame(2, $monitoring->visits()->count());
        $this->assertNotSame($startedRecord, $recordId);
    }
}
