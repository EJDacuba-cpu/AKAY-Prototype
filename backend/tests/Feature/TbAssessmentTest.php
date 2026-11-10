<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\HealthRecordDraftPayloadService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class TbAssessmentTest extends TestCase
{
    use RefreshDatabase;

    private User $doctor;
    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'TB RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'TB BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->doctor = User::create([
            'name' => 'Physician', 'email' => 'tb-doctor@example.test', 'password' => 'password123',
            'role' => 'rhu', 'staff_role' => 'doctor', 'status' => 'active', 'rural_health_unit_id' => $rhu->id,
            'permissions' => ['consultations.encode', 'consultations.finalize', 'clinical.history', 'conditions.confirm'],
        ]);
        $this->patient = Patient::create([
            'first_name' => 'TB', 'last_name' => 'Assessment', 'sex' => 'Male', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'rural_health_unit_id' => $rhu->id,
        ]);
    }

    private function submit(array $management)
    {
        $visit = RhuVisitQueueEntry::where('patient_id', $this->patient->id)->where('status', 'in_consultation')->first();
        $visit ??= RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->doctor->rural_health_unit_id, 'patient_id' => $this->patient->id,
            'source' => 'walk_in', 'status' => 'waiting', 'checked_in_at' => now(), 'check_in_key' => (string) Str::uuid(),
        ]);
        $this->actingAs($this->doctor, 'sanctum');
        $uuid = $visit->consultation_uuid ?? $this->postJson("/api/rhu-visits/{$visit->id}/start")->assertOk()->json('data.consultation_uuid');

        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'consultation_workflow' => 'rhu_itr_v1', 'rhu_visit_id' => $visit->id, 'consultation_uuid' => $uuid,
            'patient_id' => $this->patient->id, 'category' => 'General Consultation', 'chief_complaint' => 'Cough',
            'diagnoses' => [['id' => 'tb', 'name' => 'TB', 'activate' => false, 'nextAction' => 'none', 'tbManagement' => $management]],
        ]);
    }

    public function test_evaluation_persists_without_creating_treatment_data(): void
    {
        foreach (['drug_susceptible', 'pending_dst', 'rr_tb', 'mdr_tb', 'clinically_mdr_tb', 'xdr_tb', 'other'] as $resistance) {
            $assessment = ['diagnosisType' => 'tb_disease', 'drugResistance' => $resistance, 'openTreatmentCard' => false];
            $id = $this->submit($assessment)->assertCreated()->json('data.id');
            $record = HealthRecord::findOrFail($id);
            $this->assertSame($assessment, $record->diagnoses[0]['tbManagement']);
            $this->assertNull($record->tb_data);
            $this->getJson("/api/health-records/$id")->assertOk()->assertJsonPath('data.diagnoses.0.tbManagement', $assessment);
        }
        $this->assertDatabaseCount('patient_conditions', 0);
    }

    public function test_incomplete_drug_resistant_primary_requires_a_subtype(): void
    {
        $this->submit([
            'diagnosisType' => 'tb_disease',
            'drugResistance' => 'drug_resistant',
            'openTreatmentCard' => false,
        ])->assertUnprocessable()->assertJsonValidationErrors('diagnoses.0.tbManagement.drugResistance');

        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_ds_tb_finalizes_without_treatment_decision_or_legacy_disposition(): void
    {
        $this->submit([
            'diagnosisType' => 'tb_disease', 'drugResistance' => 'drug_susceptible', 'openTreatmentCard' => false,
        ])->assertCreated();

        $this->submit([
            'diagnosisType' => 'tb_disease', 'drugResistance' => 'drug_susceptible', 'openTreatmentCard' => false,
            'treatmentDecision' => 'not_yet_initiated', 'dispositionReason' => '', 'dispositionPlan' => '',
        ])->assertCreated();

        $this->assertDatabaseCount('health_records', 2);
        $this->assertDatabaseCount('tb_treatment_cases', 0);
    }

    public function test_initiate_treatment_requires_form_4b_and_registers_atomically(): void
    {
        $assessment = [
            'diagnosisType' => 'tb_disease',
            'drugResistance' => 'drug_susceptible',
            'treatmentDecision' => 'initiate_at_rhu',
            'openTreatmentCard' => true,
        ];
        $this->submit($assessment)->assertUnprocessable()->assertJsonValidationErrors('tb_case_registration');

        $visit = RhuVisitQueueEntry::where('patient_id', $this->patient->id)->where('status', 'in_consultation')->first();
        $uuid = $visit->consultation_uuid;
        $response = $this->actingAs($this->doctor, 'sanctum')->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'consultation_workflow' => 'rhu_itr_v1', 'rhu_visit_id' => $visit->id, 'consultation_uuid' => $uuid,
            'patient_id' => $this->patient->id, 'category' => 'General Consultation', 'chief_complaint' => 'Cough',
            'diagnoses' => [['id' => 'tb', 'name' => 'TB', 'activate' => false, 'nextAction' => 'none', 'tbManagement' => $assessment]],
            'tb_case_registration' => [
                'registration_key' => (string) Str::uuid(),
                'reporting_year' => 2026,
                'confirmed' => true,
                'card_data' => [
                    'classification' => [
                        'bacteriologicalStatus' => 'clinically_diagnosed',
                        'anatomicalSite' => 'pulmonary',
                        'registrationGroup' => 'new',
                    ],
                    'regimen' => [
                        'description' => 'Physician-entered regimen',
                        'weightKg' => 55,
                        'rows' => [[
                            'dateStart' => '2026-11-10',
                            'drug4fdc' => '4',
                            'strength' => 'Physician-entered strength',
                            'unit' => 'tablets/day',
                        ]],
                    ],
                ],
            ],
        ])->assertCreated();

        $id = $response->json('data.id');
        $stored = HealthRecord::findOrFail($id)->diagnoses[0]['tbManagement'];
        $this->assertSame('initiate_at_rhu', $stored['treatmentDecision']);
        $this->assertTrue($stored['openTreatmentCard']);
        $this->assertNull(HealthRecord::findOrFail($id)->tb_data);
        $this->assertDatabaseCount('tb_treatment_cases', 1);
        $this->assertDatabaseHas('tb_treatment_cases', ['source_health_record_id' => $id]);
    }

    public function test_final_assessment_rejects_invalid_types_and_resistance_combinations(): void
    {
        foreach ([
            [['diagnosisType' => 'unknown'], 'diagnosisType'],
            [['diagnosisType' => 'tb_disease', 'drugResistance' => 'invented'], 'drugResistance'],
            [['diagnosisType' => 'tb_disease', 'drugResistance' => ''], 'drugResistance'],
            [['diagnosisType' => 'tb_infection', 'drugResistance' => 'rr_tb'], 'drugResistance'],
        ] as [$assessment, $field]) {
            $this->submit($assessment)->assertUnprocessable()->assertJsonValidationErrors("diagnoses.0.tbManagement.$field");
        }
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_infection_evaluation_has_no_resistance_or_treatment_card(): void
    {
        $this->submit(['diagnosisType' => 'tb_infection', 'drugResistance' => '', 'openTreatmentCard' => false])->assertCreated();
        $this->assertNull(HealthRecord::sole()->tb_data);
    }

    public function test_presumptive_tb_finalizes_without_resistance_form_4b_or_active_condition(): void
    {
        $visit = RhuVisitQueueEntry::where('patient_id', $this->patient->id)->where('status', 'in_consultation')->first();
        $visit ??= RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->doctor->rural_health_unit_id, 'patient_id' => $this->patient->id,
            'source' => 'walk_in', 'status' => 'waiting', 'checked_in_at' => now(), 'check_in_key' => (string) Str::uuid(),
        ]);
        $this->actingAs($this->doctor, 'sanctum');
        $uuid = $visit->consultation_uuid ?? $this->postJson("/api/rhu-visits/{$visit->id}/start")->assertOk()->json('data.consultation_uuid');

        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'consultation_workflow' => 'rhu_itr_v1', 'rhu_visit_id' => $visit->id, 'consultation_uuid' => $uuid,
            'patient_id' => $this->patient->id, 'category' => 'General Consultation', 'chief_complaint' => 'Cough',
            'diagnoses' => [[
                'id' => 'tb', 'name' => 'TB', 'activate' => true, 'nextAction' => 'none',
                'tbManagement' => ['diagnosisType' => 'presumptive_tb', 'drugResistance' => '', 'openTreatmentCard' => false],
            ]],
        ])->assertCreated();

        $record = HealthRecord::sole();
        $this->assertSame('presumptive_tb', $record->diagnoses[0]['tbManagement']['diagnosisType']);
        $this->assertNull($record->tb_data);
        $this->assertDatabaseCount('tb_treatment_cases', 0);
        $this->assertDatabaseHas('patient_conditions', [
            'patient_id' => $this->patient->id,
            'condition_identity' => 'tuberculosis',
            'status' => 'under_evaluation',
        ]);
    }

    public function test_old_draft_presumptive_clears_resistance_and_open_card_flag(): void
    {
        $payload = ['diagnoses' => [['id' => 'tb', 'name' => 'TB', 'tbManagement' => [
            'diagnosisType' => 'presumptive_tb', 'drugResistance' => 'rr_tb', 'openTreatmentCard' => true,
            'treatmentDecision' => 'initiate_at_rhu', 'dispositionReason' => 'x', 'dispositionPlan' => 'y',
        ]]]];
        $stored = app(HealthRecordDraftPayloadService::class)->sanitizeStored($payload);
        $this->assertSame([
            'diagnosisType' => 'presumptive_tb',
            'drugResistance' => '',
            'openTreatmentCard' => false,
            'treatmentDecision' => '',
            'dispositionReason' => '',
            'dispositionPlan' => '',
        ], $stored['diagnoses'][0]['tbManagement']);
    }

    public function test_old_draft_infection_clears_resistance_and_open_card_flag(): void
    {
        $payload = ['diagnoses' => [['id' => 'tb', 'name' => 'TB', 'tbManagement' => [
            'diagnosisType' => 'tb_infection', 'drugResistance' => 'rr_tb', 'openTreatmentCard' => true,
            'treatmentDecision' => 'initiate_at_rhu', 'dispositionReason' => 'x', 'dispositionPlan' => 'y',
        ]]]];
        $stored = app(HealthRecordDraftPayloadService::class)->sanitizeStored($payload);
        $this->assertSame([
            'diagnosisType' => 'tb_infection',
            'drugResistance' => '',
            'openTreatmentCard' => false,
            'treatmentDecision' => '',
            'dispositionReason' => '',
            'dispositionPlan' => '',
        ], $stored['diagnoses'][0]['tbManagement']);
    }

    public function test_nurse_draft_retains_initiate_decision_without_creating_a_case(): void
    {
        $this->doctor->update(['staff_role' => 'nurse', 'permissions' => ['clinical.history', 'consultations.encode']]);
        $this->actingAs($this->doctor, 'sanctum');
        $visit = RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->doctor->rural_health_unit_id, 'patient_id' => $this->patient->id,
            'source' => 'walk_in', 'status' => 'waiting', 'checked_in_at' => now(), 'check_in_key' => (string) Str::uuid(),
        ]);
        $uuid = $this->postJson("/api/rhu-visits/{$visit->id}/start")->assertOk()->json('data.consultation_uuid');
        $assessment = [
            'diagnosisType' => 'tb_disease',
            'drugResistance' => 'drug_susceptible',
            'treatmentDecision' => 'initiate_at_rhu',
            'openTreatmentCard' => true,
            'dispositionReason' => '',
            'dispositionPlan' => '',
        ];
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'General Consultation',
            'consultation_uuid' => $uuid, 'rhu_visit_id' => $visit->id,
            'payload' => ['diagnoses' => [['id' => 'tb', 'name' => 'TB', 'tbManagement' => $assessment]]],
        ])->assertCreated()->json('data.id');
        $this->getJson("/api/health-record-drafts/$draft")->assertOk()
            ->assertJsonPath('data.payload.diagnoses.0.tbManagement.diagnosisType', 'tb_disease')
            ->assertJsonPath('data.payload.diagnoses.0.tbManagement.drugResistance', 'drug_susceptible')
            ->assertJsonPath('data.payload.diagnoses.0.tbManagement.treatmentDecision', 'initiate_at_rhu')
            ->assertJsonPath('data.payload.diagnoses.0.tbManagement.openTreatmentCard', true);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('patient_conditions', 0);
    }

    public function test_draft_without_treatment_decision_clears_orphan_open_card_flag(): void
    {
        $payload = ['diagnoses' => [['id' => 'tb', 'name' => 'TB', 'tbManagement' => [
            'diagnosisType' => 'tb_disease', 'drugResistance' => 'drug_susceptible', 'openTreatmentCard' => true,
        ]]]];
        $stored = app(HealthRecordDraftPayloadService::class)->sanitizeStored($payload);
        $this->assertFalse($stored['diagnoses'][0]['tbManagement']['openTreatmentCard']);
        $this->assertSame('', $stored['diagnoses'][0]['tbManagement']['treatmentDecision'] ?? '');
    }
}
