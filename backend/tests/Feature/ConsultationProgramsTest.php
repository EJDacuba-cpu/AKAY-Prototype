<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class ConsultationProgramsTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Programs RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Programs BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Programs BHW', 'email' => 'programs@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id]);
        $this->patient = Patient::create(['first_name' => 'Test', 'last_name' => 'Programs', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    public function test_secondary_program_data_round_trips_without_changing_primary_category(): void
    {
        $response = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'Maternal',
            'monitoring_data' => ['selectedPrograms' => ['Maternal', 'Family Planning', 'TB'], 'primaryProgram' => 'Maternal'],
            'maternal_data' => ['lmp' => '2026-08-01'],
            'family_planning_data' => ['methodUsed' => 'Condom'],
            'tb_data' => ['diagnosis' => ['tbCaseNumber' => 'TEST-001']],
        ])->assertCreated();
        $id = $response->json('data.id');
        $this->getJson("/api/health-records/$id")->assertOk()
            ->assertJsonPath('data.category', 'Maternal')
            ->assertJsonPath('data.monitoring_data.selectedPrograms', ['Maternal', 'Family Planning', 'TB'])
            ->assertJsonPath('data.family_planning_data.methodUsed', 'Condom')
            ->assertJsonPath('data.tb_data.diagnosis.tbCaseNumber', 'TEST-001');
    }

    public function test_primary_must_be_selected_and_match_category(): void
    {
        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id, 'category' => 'Maternal',
            'monitoring_data' => ['selectedPrograms' => ['Maternal'], 'primaryProgram' => 'TB'],
        ])->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.primaryProgram', 'category']);
    }

    public function test_program_selection_and_current_visit_resume_from_encrypted_draft(): void
    {
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'Maternal',
            'payload' => ['selectedPrograms' => ['Maternal', 'TB'], 'primaryProgram' => 'Maternal', 'consultationMode' => 'program', 'wizardPhase' => 'program', 'chiefComplaint' => 'Test complaint'],
        ])->assertCreated()->json('data.id');
        $this->getJson("/api/health-record-drafts/$draft")->assertOk()
            ->assertJsonPath('data.payload.selectedPrograms', ['Maternal', 'TB'])
            ->assertJsonPath('data.payload.primaryProgram', 'Maternal')
            ->assertJsonPath('data.payload.wizardPhase', 'program');
        $this->deleteJson("/api/health-record-drafts/$draft")->assertSuccessful();
        $this->getJson("/api/health-record-drafts/$draft")->assertNotFound();
    }

    public function test_draft_remembers_the_active_program_step_in_the_same_draft(): void
    {
        $payload = [
            'selectedPrograms' => ['Maternal', 'TB'], 'primaryProgram' => 'Maternal',
            'consultationMode' => 'program', 'wizardPhase' => 'form',
            'formStep' => 'program:TB DOTS / TB Monitoring', 'chiefComplaint' => 'Cough',
            'maternalData' => ['lmp' => '2026-08-01'],
            'tbData' => ['diagnosis' => ['tbCaseNumber' => 'TEST-002']],
        ];
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'Maternal', 'payload' => $payload,
        ])->assertCreated()->json('data');

        // Every program's data and the current step live in ONE draft.
        $this->getJson("/api/health-record-drafts/{$draft['id']}")->assertOk()
            ->assertJsonPath('data.payload.formStep', 'program:TB DOTS / TB Monitoring')
            ->assertJsonPath('data.payload.maternalData.lmp', '2026-08-01')
            ->assertJsonPath('data.payload.tbData.diagnosis.tbCaseNumber', 'TEST-002');

        // Moving to the next step updates that same draft, it does not fork one.
        $this->putJson("/api/health-record-drafts/{$draft['id']}", [
            'patient_id' => $this->patient->id, 'classification' => 'Maternal',
            'version' => $draft['version'], 'payload' => [...$payload, 'formStep' => 'treatment'],
        ])->assertOk();
        $this->getJson("/api/health-record-drafts/{$draft['id']}")->assertOk()
            ->assertJsonPath('data.payload.formStep', 'treatment')
            ->assertJsonPath('data.payload.tbData.diagnosis.tbCaseNumber', 'TEST-002');
        $this->getJson('/api/health-record-drafts')->assertOk()->assertJsonCount(1, 'data.data');
    }

    public function test_draft_without_a_form_step_still_saves_and_loads(): void
    {
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'Maternal',
            'payload' => ['selectedPrograms' => ['Maternal'], 'primaryProgram' => 'Maternal', 'wizardPhase' => 'form'],
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/health-record-drafts/$draft")->assertOk()
            ->assertJsonPath('data.payload.wizardPhase', 'form');
    }

    public function test_physical_exam_saves_to_its_own_column(): void
    {
        $response = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Cough for three days',
            'physical_exam' => 'Clear breath sounds, no rales.',
            'monitoring_data' => ['selectedPrograms' => [], 'primaryProgram' => null],
        ])->assertCreated();

        $id = $response->json('data.id');
        $this->getJson("/api/health-records/$id")->assertOk()
            ->assertJsonPath('data.physical_exam', 'Clear breath sounds, no rales.');

        $this->assertDatabaseHas('health_records', [
            'id' => $id,
            'physical_exam' => 'Clear breath sounds, no rales.',
        ]);
    }

    public function test_a_legacy_record_keeps_its_physical_exam_in_monitoring_data(): void
    {
        // Written the way records were before the column existed.
        $record = \App\Models\HealthRecord::create([
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Old record',
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'monitoring_data' => ['physicalExam' => 'Legacy findings.', 'monitoringNotes' => 'keep me'],
        ]);

        $data = $this->getJson("/api/health-records/{$record->id}")->assertOk()->json('data');

        // The column is empty, the legacy JSON key is untouched, and nothing
        // else in monitoring_data was disturbed.
        $this->assertNull($data['physical_exam']);
        $this->assertSame('Legacy findings.', $data['monitoring_data']['physicalExam']);
        $this->assertSame('keep me', $data['monitoring_data']['monitoringNotes']);
    }

    public function test_physical_exam_round_trips_through_a_draft(): void
    {
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'General Consultation',
            'payload' => [
                'chiefComplaint' => 'Cough',
                'physicalExam' => 'Afebrile, chest clear.',
                'wizardPhase' => 'program',
            ],
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/health-record-drafts/$draft")->assertOk()
            ->assertJsonPath('data.payload.physicalExam', 'Afebrile, chest clear.');
    }

    public function test_history_of_present_illness_saves_to_its_own_column(): void
    {
        $id = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Cough',
            'history_of_present_illness' => 'Three days of dry cough',
            'notes' => 'Advised fluids',
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/health-records/$id")->assertOk()
            ->assertJsonPath('data.history_of_present_illness', 'Three days of dry cough')
            ->assertJsonPath('data.notes', 'Advised fluids');

        // HPI no longer bleeds into the notes or medical_history columns.
        $this->assertDatabaseHas('health_records', [
            'id' => $id,
            'history_of_present_illness' => 'Three days of dry cough',
            'notes' => 'Advised fluids',
            'medical_history' => null,
        ]);
    }

    public function test_legacy_records_keep_their_history_of_present_illness(): void
    {
        // Pre-column rows: one with HPI in medical_history, one older still
        // with it only in notes. Neither is rewritten.
        $viaMedicalHistory = \App\Models\HealthRecord::create([
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'medical_history' => 'Legacy HPI in medical_history',
        ]);
        $viaNotes = \App\Models\HealthRecord::create([
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'notes' => 'Legacy HPI in notes',
        ]);

        $first = $this->getJson("/api/health-records/{$viaMedicalHistory->id}")->assertOk()->json('data');
        $this->assertNull($first['history_of_present_illness']);
        $this->assertSame('Legacy HPI in medical_history', $first['medical_history']);

        $second = $this->getJson("/api/health-records/{$viaNotes->id}")->assertOk()->json('data');
        $this->assertNull($second['history_of_present_illness']);
        $this->assertSame('Legacy HPI in notes', $second['notes']);
    }

    public function test_patient_past_medical_history_is_untouched_by_record_writes(): void
    {
        // The Patient Profile's longitudinal background lives on the patient,
        // not on health_records. Saving a consultation must not disturb it.
        $this->patient->update(['medical_background' => [
            'allergies' => 'Penicillin',
            'currentDiseases' => [['name' => 'Hypertension', 'status' => 'Active']],
        ]]);

        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'history_of_present_illness' => 'New visit HPI',
        ])->assertCreated();

        $this->patient->refresh();
        $this->assertSame('Penicillin', $this->patient->medical_background['allergies']);
        $this->assertSame('Hypertension', $this->patient->medical_background['currentDiseases'][0]['name']);
    }

    public function test_a_consultation_saves_with_no_medicine_dispensed(): void
    {
        // Medicine is optional: nothing dispensed must still save.
        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Headache',
            'diagnosis' => 'Tension headache',
            'dispensed_medicines' => [],
        ])->assertCreated();
    }

    public function test_medicine_remarks_survive_autosave_and_draft_resume(): void
    {
        $medicine = \App\Models\Medicine::create([
            'name' => 'Paracetamol', 'category' => 'Analgesic', 'unit' => 'tab',
            'quantity' => 100, 'barangay_health_center_id' => $this->patient->barangay_health_center_id,
        ]);

        $payload = [
            'chiefComplaint' => 'Fever',
            'wizardPhase' => 'form',
            'dispensedMedicines' => [[
                'medicineId' => $medicine->id,
                'quantity' => 2,
                'remarks' => 'Take after meals',
            ]],
        ];

        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'General Consultation',
            'payload' => $payload,
        ])->assertCreated()->json('data');

        // Resuming the draft must hand the remarks back, not an empty string.
        $this->getJson("/api/health-record-drafts/{$draft['id']}")->assertOk()
            ->assertJsonPath('data.payload.dispensedMedicines.0.remarks', 'Take after meals')
            ->assertJsonPath('data.payload.dispensedMedicines.0.quantity', 2);

        // And an autosave of the same draft keeps them.
        $this->putJson("/api/health-record-drafts/{$draft['id']}", [
            'patient_id' => $this->patient->id, 'classification' => 'General Consultation',
            'version' => $draft['version'], 'payload' => $payload,
        ])->assertOk();

        // The resume path reads medicineSelections, not the raw payload, so the
        // remarks must survive that mapping too.
        $this->getJson("/api/health-record-drafts/{$draft['id']}")->assertOk()
            ->assertJsonPath('data.payload.dispensedMedicines.0.remarks', 'Take after meals')
            ->assertJsonPath('data.medicine_selections.0.remarks', 'Take after meals')
            ->assertJsonPath('data.medicine_selections.0.quantity', 2);
    }

    public function test_draft_form_step_must_be_a_short_string(): void
    {
        $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'Maternal',
            'payload' => ['selectedPrograms' => ['Maternal'], 'primaryProgram' => 'Maternal', 'formStep' => str_repeat('x', 101)],
        ])->assertUnprocessable()->assertJsonValidationErrors(['payload.formStep']);
    }
}
