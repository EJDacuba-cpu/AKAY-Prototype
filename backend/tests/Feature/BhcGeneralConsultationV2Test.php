<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use App\Services\ReportingEntries;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** BHC-only General Consultation v2: request validation of the visit-level next actions. */
class BhcGeneralConsultationV2Test extends TestCase
{
    use RefreshDatabase;

    private User $worker;

    private Patient $patient;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'V2 RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'V2 BHC', 'rural_health_unit_id' => $this->rhu->id]);
        $this->worker = User::create(['name' => 'V2 Worker', 'email' => 'v2@example.test', 'password' => 'password123', 'role' => 'bhw', 'status' => 'active', 'barangay_health_center_id' => $this->bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'Test', 'last_name' => 'Patient', 'sex' => 'Female', 'birthdate' => '2000-01-01', 'barangay_health_center_id' => $this->bhc->id, 'rural_health_unit_id' => $this->rhu->id, 'created_by' => $this->worker->id]);
        Sanctum::actingAs($this->worker, ['akay:access']);
    }

    private function v2(array $extra = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            ...[
                'patient_id' => $this->patient->id,
                'consultation_workflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
                'chief_complaint' => 'Cough for 3 days',
                'category' => 'General Consultation',
            ],
            ...$extra,
        ]);
    }

    private function referral(): array
    {
        return ['needs_referral' => true, 'referral' => ['reason_for_referral' => 'Further assessment', 'urgency_level' => 'Routine']];
    }

    private function nextWeek(): string
    {
        return now()->addWeek()->toDateString();
    }

    private function followedHypertension(): ConditionMonitoring
    {
        $record = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->bhc->id]);
        $condition = PatientCondition::create(['patient_id' => $this->patient->id, 'condition_name' => 'Hypertension', 'condition_identity' => 'hypertension', 'status' => 'active', 'confirmed_at' => now(), 'source_type' => PatientCondition::SOURCE_RHU_RECORD, 'source_id' => 1]);
        $monitoring = ConditionMonitoring::create(['patient_id' => $this->patient->id, 'patient_condition_id' => $condition->id, 'barangay_health_center_id' => $this->bhc->id, 'condition_key' => 'hypertension', 'condition_name' => 'Hypertension', 'condition_identity' => 'hypertension', 'status' => 'active', 'started_health_record_id' => $record->id, 'started_at' => now()->subWeek()]);
        $monitoring->visits()->create(['health_record_id' => $record->id, 'action' => 'started', 'referred' => false, 'created_at' => now()]);

        return $monitoring;
    }

    /** Guard: passes before the change too (unknown keys are ignored); kept as a regression guard. */
    public function test_v2_without_actions_or_reporting_saves(): void
    {
        $this->v2()->assertCreated();
    }

    public function test_rhu_user_cannot_send_v2(): void
    {
        $rhuUser = User::create(['name' => 'V2 RHU Staff', 'email' => 'v2rhu@example.test', 'password' => 'password123', 'role' => User::ROLE_RHU_STAFF, 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id, 'permissions' => [...ActionPermissions::PRESETS['clinical'], 'rhu.manage', 'conditions.confirm']]);
        Sanctum::actingAs($rhuUser, ['akay:access']);

        $this->v2()->assertUnprocessable()->assertJsonValidationErrors(['consultation_workflow']);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_v2_rejects_diagnosis_text(): void
    {
        $this->v2(['diagnosis' => 'Suspected dengue'])->assertUnprocessable()->assertJsonValidationErrors(['diagnosis']);
    }

    #[DataProvider('prohibitedEntryKeys')]
    public function test_v2_rejects_condition_and_care_plan_keys_on_entries(string $key, mixed $value): void
    {
        $this->v2(['diagnoses' => [['name' => 'Cough', 'reportIn' => ['morbidity'], $key => $value]]])
            ->assertUnprocessable()->assertJsonValidationErrors(["diagnoses.0.$key"]);
    }

    public static function prohibitedEntryKeys(): array
    {
        return [
            'carePlan' => ['carePlan', 'follow_up'],
            'bhcFollowUp' => ['bhcFollowUp', true],
            'addToConditions' => ['addToConditions', false],
            'conditionStatus' => ['conditionStatus', 'active'],
            'conditionKey' => ['conditionKey', 'hypertension'],
        ];
    }

    public function test_v2_entry_requires_a_destination(): void
    {
        $this->v2(['diagnoses' => [['name' => 'Cough', 'reportIn' => []]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.reportIn']);
    }

    public function test_v2_rejects_unknown_destination(): void
    {
        $this->v2(['diagnoses' => [['name' => 'Cough', 'reportIn' => ['bogus']]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.reportIn.0']);
    }

    public function test_v2_accepts_every_known_destination(): void
    {
        $this->v2(['diagnoses' => [['name' => 'Cough', 'reportIn' => ReportingEntries::DESTINATIONS]]])->assertCreated();
    }

    public function test_v2_two_entries_may_share_a_report(): void
    {
        $this->v2(['diagnoses' => [
            ['name' => 'Cough', 'reportIn' => ['morbidity']],
            ['name' => 'Fever', 'reportIn' => ['morbidity']],
        ]])->assertCreated();
    }

    public function test_v2_rejects_duplicate_destination_within_an_entry(): void
    {
        $this->v2(['diagnoses' => [['name' => 'Cough', 'reportIn' => ['morbidity', 'morbidity']]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.reportIn']);
    }

    public function test_v2_non_string_entry_name_is_a_validation_error_not_a_500(): void
    {
        $this->v2(['diagnoses' => [['name' => ['x'], 'reportIn' => ['morbidity']]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.name']);
    }

    public function test_admin_without_bhc_facility_cannot_send_v2(): void
    {
        $admin = User::create(['name' => 'V2 Admin', 'email' => 'v2admin@example.test', 'password' => 'password123', 'role' => User::ROLE_ADMIN, 'status' => 'active', 'permissions' => ActionPermissions::PRESETS['clinical']]);
        Sanctum::actingAs($admin, ['akay:access']);

        $this->v2()->assertUnprocessable()->assertJsonValidationErrors(['consultation_workflow']);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_v2_rejects_duplicate_entry_names(): void
    {
        $this->v2(['diagnoses' => [
            ['name' => 'Suspected dengue', 'reportIn' => ['morbidity']],
            ['name' => ' suspected DENGUE', 'reportIn' => ['surveillance']],
        ]])->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.1.name']);
    }

    public function test_v2_keys_are_prohibited_on_legacy_payloads(): void
    {
        $base = ['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'chief_complaint' => 'Routine visit'];
        foreach ([
            'care_plan.bhc_follow_up' => ['care_plan' => ['bhc_follow_up' => true]],
            'care_plan.refer_to_rhu' => ['care_plan' => ['refer_to_rhu' => true]],
            'care_plan.referral_multiple_issues' => ['care_plan' => ['referral_multiple_issues' => true]],
            'diagnoses.0.reportIn' => ['diagnoses' => [['name' => 'Cough', 'reportIn' => ['morbidity']]]],
        ] as $key => $extra) {
            $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [...$base, ...$extra])
                ->assertUnprocessable()->assertJsonValidationErrors([$key]);
        }
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_v2_follow_up_requires_date(): void
    {
        $this->v2(['care_plan' => ['bhc_follow_up' => true], 'monitoring_data' => ['followUpReason' => 'Recheck cough']])
            ->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.followUpDate']);
    }

    public function test_v2_follow_up_requires_reason_for_general_consultation(): void
    {
        $this->v2(['care_plan' => ['bhc_follow_up' => true], 'monitoring_data' => ['followUpDate' => $this->nextWeek()]])
            ->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.followUpReason']);
    }

    public function test_v2_service_only_follow_up_reason_exempt_but_date_required(): void
    {
        $maternal = ['selectedPrograms' => ['Maternal'], 'primaryProgram' => 'Maternal'];
        $this->v2(['category' => 'Maternal', 'care_plan' => ['bhc_follow_up' => true], 'monitoring_data' => [...$maternal, 'followUpDate' => $this->nextWeek()]])
            ->assertCreated();
        $this->v2(['category' => 'Maternal', 'care_plan' => ['bhc_follow_up' => true], 'monitoring_data' => $maternal])
            ->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.followUpDate']);
    }

    public function test_v2_refer_requires_referral(): void
    {
        $this->v2(['care_plan' => ['refer_to_rhu' => true]])
            ->assertUnprocessable()->assertJsonValidationErrors(['needs_referral']);
    }

    public function test_v2_referral_requires_reason(): void
    {
        $this->v2(['care_plan' => ['refer_to_rhu' => true], 'needs_referral' => true])
            ->assertUnprocessable()->assertJsonValidationErrors(['referral.reason_for_referral']);
    }

    public function test_v2_referral_without_purpose_rejected(): void
    {
        $this->v2($this->referral())
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.refer_to_rhu']);
    }

    public function test_v2_refer_to_rhu_with_referral_saves(): void
    {
        $this->v2(['care_plan' => ['refer_to_rhu' => true], ...$this->referral()])->assertCreated();
    }

    public function test_v2_multiple_issues_requires_acknowledgment(): void
    {
        $payload = ['care_plan' => ['refer_to_rhu' => true, 'referral_multiple_issues' => true], ...$this->referral()];
        $this->v2($payload)->assertUnprocessable()->assertJsonValidationErrors(['care_plan.shared_referral_acknowledged']);
        $this->v2([...$payload, 'care_plan' => [...$payload['care_plan'], 'shared_referral_acknowledged' => true]])->assertCreated();
    }

    public function test_v2_general_referral_plus_monitoring_referral_requires_acknowledgment(): void
    {
        $monitoring = $this->followedHypertension();
        $carePlan = ['refer_to_rhu' => true, 'continued_monitoring_ids' => [$monitoring->id], 'monitoring_referrals' => [$monitoring->id]];
        $this->v2(['care_plan' => $carePlan, ...$this->referral()])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.shared_referral_acknowledged']);
        $this->v2(['care_plan' => [...$carePlan, 'shared_referral_acknowledged' => true], ...$this->referral()])
            ->assertCreated();
    }

    public function test_v2_monitoring_referral_alone_is_a_valid_referral_purpose(): void
    {
        $monitoring = $this->followedHypertension();
        $this->v2(['care_plan' => ['continued_monitoring_ids' => [$monitoring->id], 'monitoring_referrals' => [$monitoring->id]], ...$this->referral()])
            ->assertCreated();
    }

    public function test_v2_skips_assessment_rule(): void
    {
        $this->v2([
            'care_plan' => ['bhc_follow_up' => true],
            'monitoring_data' => ['followUpDate' => $this->nextWeek(), 'followUpReason' => 'Recheck cough'],
        ])->assertCreated();
    }
}
