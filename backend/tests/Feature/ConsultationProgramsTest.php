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
}
