<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * NCD Monitoring as a consultation program: selected like any other program,
 * its own data in monitoring_data.ncdData (no vitals), vitals in vital_signs.
 */
class NcdMonitoringProgramTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'NCD RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'NCD BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        // Saving a consultation needs consultations.finalize, which the default
        // BHW (encoder) preset does not carry.
        $user = User::create(['name' => 'NCD BHW', 'email' => 'ncd@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'Test', 'last_name' => 'Ncd', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    private function store(array $overrides)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up of blood pressure',
            'diagnosis' => 'Hypertension; Diabetes Mellitus',
            'diagnoses' => [
                ['id' => 'd1', 'name' => 'Hypertension', 'addToConditions' => false],
                ['id' => 'd2', 'name' => 'Diabetes Mellitus', 'addToConditions' => false],
            ],
            'vital_signs' => ['systolicBp' => 140, 'diastolicBp' => 90],
            ...$overrides,
        ]);
    }

    public function test_ncd_program_and_its_data_round_trip_with_vitals_kept_separate(): void
    {
        $id = $this->store([
            'monitoring_data' => [
                'selectedPrograms' => ['NCD'],
                'primaryProgram' => 'NCD',
                'ncdData' => ['conditions' => ['Hypertension', 'Diabetes Mellitus'], 'diabetes' => ['fbs' => '126 mg/dL']],
            ],
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/health-records/$id")->assertOk()
            ->assertJsonPath('data.category', 'NCD Monitoring')
            ->assertJsonPath('data.monitoring_data.selectedPrograms', ['NCD'])
            ->assertJsonPath('data.monitoring_data.ncdData.conditions', ['Hypertension', 'Diabetes Mellitus'])
            ->assertJsonPath('data.monitoring_data.ncdData.diabetes.fbs', '126 mg/dL')
            ->assertJsonPath('data.vital_signs.systolicBp', 140);
    }

    public function test_ncd_can_be_an_additional_program_beside_a_primary_one(): void
    {
        $this->store([
            'category' => 'TB DOTS / TB Monitoring',
            'monitoring_data' => [
                'selectedPrograms' => ['TB', 'NCD'],
                'primaryProgram' => 'TB',
                'ncdData' => ['conditions' => ['Hypertension']],
            ],
            'tb_data' => ['diagnosis' => ['tbCaseNumber' => 'NCD-TB-1'], 'phases' => ['intensiveStart' => '2026-09-01']],
        ])->assertCreated();
    }

    public function test_ncd_data_rejects_vitals_unknown_keys_and_unknown_conditions(): void
    {
        $this->store([
            'monitoring_data' => [
                'selectedPrograms' => ['NCD'],
                'primaryProgram' => 'NCD',
                'ncdData' => [
                    'conditions' => ['Asthma', 'Hypertension', 'Hypertension'],
                    'bp' => '140/90',
                    'diabetes' => ['fbs' => str_repeat('9', 101), 'rbs' => '200'],
                ],
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors([
            'monitoring_data.ncdData',
            'monitoring_data.ncdData.conditions.0',
            'monitoring_data.ncdData.conditions.1',
            'monitoring_data.ncdData.diabetes',
            'monitoring_data.ncdData.diabetes.fbs',
        ]);
    }

    public function test_ncd_data_round_trips_through_a_draft(): void
    {
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'NCD Monitoring',
            'payload' => [
                'selectedPrograms' => ['NCD'], 'primaryProgram' => 'NCD', 'consultationMode' => 'program',
                'wizardPhase' => 'form', 'formStep' => 'program:NCD Monitoring', 'chiefComplaint' => 'BP check',
                'ncdData' => ['conditions' => ['Diabetes Mellitus'], 'diabetes' => ['fbs' => '110']],
            ],
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/health-record-drafts/$draft")->assertOk()
            ->assertJsonPath('data.payload.selectedPrograms', ['NCD'])
            ->assertJsonPath('data.payload.ncdData.conditions', ['Diabetes Mellitus'])
            ->assertJsonPath('data.payload.ncdData.diabetes.fbs', '110');
    }
}
