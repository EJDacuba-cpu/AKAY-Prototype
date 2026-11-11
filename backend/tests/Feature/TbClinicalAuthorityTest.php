<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class TbClinicalAuthorityTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;
    private User $doctor;
    private User $nurse;
    private User $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'TB RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'TB BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->patient = Patient::create(['first_name' => 'Authority', 'last_name' => 'Test', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id, 'rural_health_unit_id' => $rhu->id]);
        foreach (['doctor', 'nurse'] as $role) {
            $this->$role = User::create([
                'name' => $role, 'email' => "$role@example.test", 'password' => 'password123',
                'role' => 'rhu', 'staff_role' => $role, 'status' => 'active', 'rural_health_unit_id' => $rhu->id,
                'permissions' => [...StaffRoles::defaults($role), 'consultations.encode', 'consultations.finalize', 'records.correct'],
            ]);
        }
        $this->bhc = User::create([
            'name' => 'Midwife', 'email' => 'bhc@example.test', 'password' => 'password123',
            'role' => 'bhc', 'staff_role' => 'midwife', 'status' => 'active', 'barangay_health_center_id' => $bhc->id,
            'permissions' => [...StaffRoles::defaults('midwife'), 'conditions.confirm'],
        ]);
    }

    private function postRecord(User $user, array $extra = [])
    {
        return $this->actingAs($user, 'sanctum')->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id, 'category' => 'General Consultation', 'chief_complaint' => 'Review', ...$extra,
        ]);
    }

    private function assessment(array $extra = []): array
    {
        return ['diagnoses' => [['id' => 'tb', 'name' => 'PTB', 'tbManagement' => [
            'diagnosisType' => 'tb_disease',
            'drugResistance' => 'drug_susceptible',
            'treatmentDecision' => 'not_yet_initiated',
            'dispositionReason' => 'Awaiting confirmatory results',
            'dispositionPlan' => 'RHU follow-up with labs',
            'openTreatmentCard' => false,
            ...$extra,
        ]]]];
    }

    public function test_general_permissions_do_not_allow_nurse_or_bhc_to_finalize_tb_assessment(): void
    {
        foreach ([$this->nurse, $this->bhc] as $user) {
            $this->postRecord($user, $this->assessment())->assertForbidden();
        }
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_physician_can_finalize_evaluation_but_not_embed_clinical_tb_data(): void
    {
        $this->postRecord($this->doctor, $this->assessment())->assertCreated();
        // Consultation Form 4B is removed; openTreatmentCard must stay off on finalize.
        $this->postRecord($this->doctor, $this->assessment(['openTreatmentCard' => true]))
            ->assertUnprocessable()->assertJsonValidationErrors('diagnoses.0.tbManagement.openTreatmentCard');
        $this->postRecord($this->doctor, ['tb_data' => ['diagnosis' => ['tbCaseNumber' => 'TB-2026-0001']]])
            ->assertUnprocessable()->assertJsonValidationErrors('tb_data');
        $this->assertDatabaseCount('health_records', 1);
        $this->assertNull(HealthRecord::sole()->tb_data);
    }

    public function test_physician_still_needs_condition_confirmation_permission(): void
    {
        $this->doctor->update(['permissions' => ['clinical.history', 'consultations.finalize']]);
        $this->postRecord($this->doctor, $this->assessment())->assertForbidden();
    }

    public function test_nurse_cannot_bypass_with_diagnosis_name_or_explicit_condition_id(): void
    {
        $this->postRecord($this->nurse, ['diagnoses' => [['name' => 'Pulmonary TB', 'activate' => true]]])->assertForbidden();
        $this->postRecord($this->nurse, ['condition_confirmations' => [['name' => 'PTB', 'status' => 'active']]])->assertForbidden();
        $this->postRecord($this->doctor, ['condition_confirmations' => [['name' => 'PTB', 'status' => 'active']]])->assertCreated();
        $condition = PatientCondition::sole();
        $this->postRecord($this->nurse, ['condition_confirmations' => [['condition_id' => $condition->id, 'name' => 'Asthma', 'status' => 'resolved']]])->assertForbidden();
        $this->assertSame('active', $condition->fresh()->status);
        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_non_tb_nurse_finalization_and_bhc_presumptive_concerns_still_work(): void
    {
        $this->postRecord($this->nurse, ['condition_confirmations' => [['name' => 'Hypertension', 'status' => 'active']]])->assertCreated();
        $this->postRecord($this->bhc, ['diagnoses' => [['name' => 'TB', 'carePlan' => 'none']]])->assertCreated();
    }

    public function test_nurse_cannot_confirm_tb_on_return_slip_and_transaction_stays_unchanged(): void
    {
        $referral = Referral::create([
            'tracking_id' => 'TB-REF', 'qr_code_value' => 'TB-REF', 'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'rural_health_unit_id' => $this->patient->rural_health_unit_id, 'status' => Referral::STATUS_RECEIVED,
            'reason_for_referral' => 'TB evaluation',
        ]);
        $this->actingAs($this->nurse, 'sanctum')->postJson('/api/feedback', [
            'referral_id' => $referral->id, 'rhu_diagnosis' => 'PTB',
        ])->assertForbidden();
        $this->postJson('/api/feedback', [
            'referral_id' => $referral->id, 'rhu_diagnosis' => 'Review',
            'condition_confirmations' => [['name' => 'TB', 'status' => 'active']],
        ])->assertForbidden();
        $this->assertDatabaseCount('feedback', 0);
        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
        $this->actingAs($this->doctor, 'sanctum')->postJson('/api/feedback', [
            'referral_id' => $referral->id, 'rhu_diagnosis' => 'PTB',
            'condition_confirmations' => [['name' => 'TB', 'status' => 'active']],
        ])->assertCreated();
    }

    public function test_bhc_cannot_create_or_change_legacy_clinical_card_fields(): void
    {
        foreach (['diagnosis' => ['tbCaseNumber' => 'NEW'], 'classification' => ['drugResistance' => 'rr_tb'],
            'regimen' => ['rows' => [['drug4fdc' => '4']]], 'outcome' => ['status' => 'cured', 'date' => '2026-11-09']] as $group => $fields) {
            $this->postRecord($this->bhc, ['tb_data' => [$group => $fields]])->assertForbidden();
        }
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_legacy_snapshot_can_be_carried_forward_unchanged_with_new_doses(): void
    {
        $card = ['diagnosis' => ['diagnosisType' => 'tb_disease', 'tbCaseNumber' => 'LEGACY-1'], 'classification' => ['drugResistance' => 'drug_susceptible']];
        $source = HealthRecord::create([
            'patient_id' => $this->patient->id, 'category' => 'General Consultation',
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'rural_health_unit_id' => $this->patient->rural_health_unit_id, 'created_by' => $this->doctor->id, 'tb_data' => $card,
        ]);
        $withDoses = [...$card, 'doseCalendar' => ['months' => [['monthIndex' => 0, 'days' => ['AB'], 'weightKg' => '55']]]];
        $this->postRecord($this->bhc, ['tb_data' => $withDoses])->assertCreated();
        $withDoses['classification']['drugResistance'] = 'rr_tb';
        $this->postRecord($this->bhc, ['tb_data' => $withDoses])->assertForbidden();
        $this->assertSame($card, $source->fresh()->tb_data);
    }

    public function test_other_patient_card_cannot_authorize_a_copied_clinical_snapshot(): void
    {
        $other = Patient::create(['first_name' => 'Other', 'last_name' => 'Patient', 'sex' => 'Male', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $card = ['diagnosis' => ['tbCaseNumber' => 'OTHER-1']];
        HealthRecord::create(['patient_id' => $other->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $other->barangay_health_center_id, 'tb_data' => $card]);
        $this->postRecord($this->bhc, ['tb_data' => $card])->assertForbidden();
    }

    public function test_unrecognized_assessment_placement_and_alias_are_rejected(): void
    {
        $this->postRecord($this->doctor, ['diagnoses' => [['name' => 'Asthma', 'tbManagement' => ['diagnosisType' => 'tb_infection']]]])->assertUnprocessable();
        $this->postRecord($this->nurse, ['diagnoses' => [['name' => 'TB', 'tb_management' => ['diagnosis_type' => 'tb_disease']]]])->assertUnprocessable();
    }

    public function test_bhc_can_prepare_dots_drafts_without_official_tb_authority(): void
    {
        $this->actingAs($this->bhc, 'sanctum')->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'General Consultation',
            'payload' => ['tbData' => ['doseCalendar' => ['months' => [['monthIndex' => 0, 'days' => ['AB']]]]]],
        ])->assertCreated();
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_administrator_or_doctor_working_at_bhc_does_not_gain_tb_authority(): void
    {
        $this->bhc->update(['staff_role' => 'doctor']);
        $this->postRecord($this->bhc, $this->assessment())->assertForbidden();
        $admin = User::create([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => 'password123',
            'role' => 'admin', 'status' => 'active', 'permissions' => ['consultations.finalize', 'conditions.confirm', 'clinical.history'],
        ]);
        $this->postRecord($admin, $this->assessment())->assertForbidden();
    }

    public function test_other_rhu_physician_cannot_finalize_this_patients_assessment(): void
    {
        $otherRhu = RuralHealthUnit::create(['name' => 'Other RHU', 'status' => 'active']);
        $this->doctor->update(['rural_health_unit_id' => $otherRhu->id]);
        $this->postRecord($this->doctor, $this->assessment())->assertForbidden();
    }

    public function test_out_of_scope_card_cannot_authorize_carry_forward_even_for_same_patient(): void
    {
        $otherBhc = BarangayHealthCenter::create(['name' => 'Other BHC', 'status' => 'active']);
        $card = ['diagnosis' => ['tbCaseNumber' => 'HIDDEN-1']];
        HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $otherBhc->id, 'tb_data' => $card]);
        $this->postRecord($this->bhc, ['tb_data' => $card])->assertForbidden();
    }

    public function test_invalid_outcome_is_rejected_instead_of_persisting_unvalidated_json(): void
    {
        $this->postRecord($this->doctor, ['tb_data' => ['outcome' => ['status' => 'invented']]])
            ->assertUnprocessable()->assertJsonValidationErrors('tb_data.outcome.status');
    }

    public function test_qualified_and_mixed_tb_diagnoses_cannot_bypass_physician_authority(): void
    {
        $referral = Referral::create([
            'tracking_id' => 'TB-TEXT', 'qr_code_value' => 'TB-TEXT', 'patient_id' => $this->patient->id,
            'reason_for_referral' => 'TB evaluation',
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'rural_health_unit_id' => $this->patient->rural_health_unit_id, 'status' => Referral::STATUS_RECEIVED,
        ]);
        foreach (['TB, Hypertension', 'Confirmed pulmonary TB', 'TB Disease', 'TB Infection', 'MDR-TB', 'Latent tuberculosis', 'LTBI'] as $name) {
            $this->actingAs($this->nurse, 'sanctum')->postJson('/api/feedback', [
                'referral_id' => $referral->id, 'rhu_diagnosis' => $name,
            ])->assertForbidden();
            $this->postRecord($this->nurse, ['diagnosis' => $name])->assertForbidden();
            $this->postRecord($this->nurse, ['diagnoses' => [['name' => $name]]])->assertForbidden();
        }
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('feedback', 0);
        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
    }

    public function test_unsupported_physician_duty_assignments_cannot_bypass_home_authority(): void
    {
        $duty = $this->doctor->facilityAssignments()->create([
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'permissions' => ['clinical.history', 'consultations.finalize', 'conditions.confirm'],
            'starts_on' => today(), 'ends_on' => today(),
        ]);
        $this->withHeader('X-Working-Facility', (string) $duty->id);
        $this->postRecord($this->doctor, $this->assessment())->assertForbidden();

        $otherRhu = RuralHealthUnit::create(['name' => 'Duty RHU', 'status' => 'active']);
        $this->patient->update(['rural_health_unit_id' => $otherRhu->id]);
        $rhuDuty = $this->doctor->facilityAssignments()->create([
            'rural_health_unit_id' => $otherRhu->id,
            'permissions' => ['clinical.history', 'consultations.finalize'],
            'starts_on' => today(), 'ends_on' => today(),
        ]);
        $this->doctor = $this->doctor->fresh();
        $this->withHeader('X-Working-Facility', (string) $rhuDuty->id);
        $this->postRecord($this->doctor, $this->assessment())->assertForbidden();
        $rhuDuty->update(['permissions' => ['clinical.history', 'consultations.finalize', 'conditions.confirm']]);
        $this->doctor = $this->doctor->fresh();
        // Current assignment policy supports RHU nurses at BHC only; grants
        // must not turn a physician's unsupported duty into an authorized one.
        $this->postRecord($this->doctor, $this->assessment())->assertForbidden();
        $this->patient->update(['rural_health_unit_id' => $this->doctor->getRawOriginal('rural_health_unit_id')]);
        $this->withHeader('X-Working-Facility', 'home');
        $this->postRecord($this->doctor, $this->assessment())->assertCreated();
    }
}
