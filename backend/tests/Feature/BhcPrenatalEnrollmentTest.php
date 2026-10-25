<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\PrenatalEnrollment;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BhcPrenatalEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'BHC Prenatal RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'BHC Prenatal Center',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
    }

    private function bhcUser(array $permissions, array $attributes = []): User
    {
        return User::create([
            'name' => 'BHC Prenatal Staff',
            'email' => uniqid('', true).'@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => User::ROLE_BHC,
            'staff_role' => 'midwife',
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => $permissions,
            ...$attributes,
        ]);
    }

    private function encoder(): User
    {
        return $this->bhcUser(StaffRoles::defaults('encoder'), ['staff_role' => 'encoder']);
    }

    private function clinician(): User
    {
        return $this->bhcUser(StaffRoles::defaults('midwife'));
    }

    private function patient(array $attributes = []): Patient
    {
        return Patient::create([
            'first_name' => 'Prenatal',
            'last_name' => uniqid(),
            'sex' => 'Female',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            ...$attributes,
        ]);
    }

    private function as(User $user): static
    {
        Sanctum::actingAs($user, ['akay:access']);

        return $this;
    }

    private function postRecord(User $user, Patient $patient, array $overrides = [])
    {
        return $this->as($user)
            ->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
            ->postJson('/api/health-records', [
                'consultation_workflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
                'patient_id' => $patient->id,
                'category' => 'Maternal',
                'chief_complaint' => 'Initial prenatal checkup',
                ...$overrides,
            ]);
    }

    private function prenatalPayload(array $overrides = []): array
    {
        return array_replace_recursive([
            'monitoring_data' => [
                'selectedPrograms' => ['Maternal'],
                'primaryProgram' => 'Maternal',
                'prenatalIntent' => PrenatalEnrollment::INTENT_ENROLL,
            ],
            'maternal_data' => [
                'lmp' => '2026-03-01',
                'expectedDeliveryDate' => '2026-12-08',
                'gravida' => '1',
                'para' => '0',
            ],
        ], $overrides);
    }

    public function test_new_prenatal_enrollment_finalizes_and_becomes_active(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();

        $this->postRecord($clinician, $patient, $this->prenatalPayload())
            ->assertCreated();

        $this->assertSame(1, HealthRecord::query()->where('patient_id', $patient->id)->count());
        $state = PrenatalEnrollment::stateFor($patient->id);
        $this->assertTrue($state['enrolled']);
        $this->assertSame(PrenatalEnrollment::STATUS_PRENATAL, $state['status']);
        $this->assertSame('enroll', $state['latest']->monitoring_data['prenatalIntent'] ?? null);
    }

    public function test_draft_does_not_activate_prenatal_enrollment(): void
    {
        $patient = $this->patient();
        $encoder = $this->encoder();

        $this->as($encoder)->postJson('/api/health-record-drafts', [
            'patient_id' => $patient->id,
            'classification' => 'Maternal',
            'payload' => [
                'consultationWorkflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
                'selectedPrograms' => ['Maternal'],
                'primaryProgram' => 'Maternal',
                'prenatalIntent' => PrenatalEnrollment::INTENT_ENROLL,
                'chiefComplaint' => 'Prenatal visit',
                'maternalData' => ['lmp' => '2026-03-01', 'fht' => '140 bpm'],
            ],
        ])->assertCreated();

        $this->assertDatabaseCount('health_records', 0);
        $this->assertFalse(PrenatalEnrollment::stateFor($patient->id)['enrolled']);
        $this->postRecord($encoder, $patient, $this->prenatalPayload())->assertForbidden();
    }

    public function test_mixed_general_and_prenatal_consultation_keeps_both(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();

        $this->postRecord($clinician, $patient, $this->prenatalPayload([
            'chief_complaint' => 'Cough and first prenatal visit',
            'history_of_present_illness' => 'Cough for 3 days. Also due for prenatal booking.',
            'physical_exam' => 'Clear chest. Fundus not yet palpable.',
        ]))->assertCreated();

        $record = HealthRecord::query()->where('patient_id', $patient->id)->sole();
        $this->assertSame('Cough and first prenatal visit', $record->chief_complaint);
        $this->assertSame('Cough for 3 days. Also due for prenatal booking.', $record->history_of_present_illness);
        $this->assertSame('Clear chest. Fundus not yet palpable.', $record->physical_exam);
        $this->assertSame('Maternal', $record->category);
        $this->assertSame(['Maternal'], $record->monitoring_data['selectedPrograms']);
        $this->assertTrue(PrenatalEnrollment::stateFor($patient->id)['enrolled']);
    }

    public function test_continue_loads_existing_enrollment_without_creating_another(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();

        $this->postRecord($clinician, $patient, $this->prenatalPayload())->assertCreated();

        $this->postRecord($clinician, $patient, $this->prenatalPayload([
            'chief_complaint' => 'Prenatal follow-up',
            'monitoring_data' => ['prenatalIntent' => PrenatalEnrollment::INTENT_CONTINUE],
            'maternal_data' => ['lmp' => '2026-03-01', 'fht' => '142 bpm', 'aog' => '24 weeks'],
        ]))->assertCreated();

        $this->assertSame(2, HealthRecord::query()->where('patient_id', $patient->id)->count());
        $state = PrenatalEnrollment::stateFor($patient->id);
        $this->assertTrue($state['enrolled']);
        $this->assertSame(PrenatalEnrollment::STATUS_PRENATAL, $state['status']);
        $this->assertSame('142 bpm', $state['latest']->maternal_data['fht'] ?? null);
    }

    public function test_duplicate_enroll_is_rejected_while_prenatal_is_active(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();

        $this->postRecord($clinician, $patient, $this->prenatalPayload())->assertCreated();
        $this->postRecord($clinician, $patient, $this->prenatalPayload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['monitoring_data.prenatalIntent']);

        $this->assertSame(1, HealthRecord::query()->where('patient_id', $patient->id)->count());
    }

    public function test_enroll_without_lmp_is_rejected(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();

        $this->postRecord($clinician, $patient, $this->prenatalPayload([
            'maternal_data' => ['lmp' => ''],
        ]))->assertUnprocessable()->assertJsonValidationErrors(['maternal_data.lmp']);

        $this->assertDatabaseCount('health_records', 0);
        $this->assertFalse(PrenatalEnrollment::stateFor($patient->id)['enrolled']);
    }

    public function test_continue_without_an_active_enrollment_is_rejected(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();

        $this->postRecord($clinician, $patient, $this->prenatalPayload([
            'monitoring_data' => ['prenatalIntent' => PrenatalEnrollment::INTENT_CONTINUE],
        ]))->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.prenatalIntent']);
    }
}
