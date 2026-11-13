<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\TbCaseEndorsement;
use App\Models\TbTreatmentCase;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Option A: new TB endorsements and DOTS writes are retired; historical reads
 * and in-flight endorsement resolution (link/accept/decline) remain.
 */
class TbWorkflowRetirementTest extends TestCase
{
    use RefreshDatabase;

    private User $doctor;

    private User $receiver;

    private BarangayHealthCenter $bhc;

    private Patient $patient;

    private TbTreatmentCase $case;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Retirement RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Retirement BHC',
            'status' => 'active',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->doctor = User::create([
            'name' => 'Doctor',
            'email' => 'tb-retire-doctor@example.test',
            'password' => 'password123',
            'role' => 'rhu',
            'staff_role' => 'doctor',
            'status' => 'active',
            'rural_health_unit_id' => $rhu->id,
            'permissions' => ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm'],
        ]);
        $this->receiver = User::create([
            'name' => 'Midwife',
            'email' => 'tb-retire-bhc@example.test',
            'password' => 'password123',
            'role' => 'bhc',
            'staff_role' => 'midwife',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => ['clinical.history', 'consultations.encode'],
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'sex' => 'Female',
            'birthdate' => '1990-01-01',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $source = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'rural_health_unit_id' => $rhu->id,
            'category' => 'General Consultation',
            'finalized_at' => now(),
            'finalized_by' => $this->doctor->id,
            'monitoring_data' => ['consultationWorkflow' => 'rhu_itr_v1'],
            'diagnoses' => [['name' => 'TB', 'tbManagement' => [
                'diagnosisType' => 'tb_disease',
                'drugResistance' => 'drug_susceptible',
            ]]],
        ]);
        $this->case = TbTreatmentCase::create([
            'patient_id' => $this->patient->id,
            'rural_health_unit_id' => $rhu->id,
            'source_health_record_id' => $source->id,
            'case_number' => 'TB-RETIRE-0001',
            'reporting_year' => 2026,
            'registered_by' => $this->doctor->id,
            'registered_at' => now(),
            'version' => 1,
            'diagnosis_snapshot' => [],
            'card_data' => [
                'classification' => ['drugResistance' => 'drug_susceptible'],
                'regimen' => [
                    'description' => 'Physician prescription',
                    'rows' => [['dateStart' => '2026-11-01']],
                ],
            ],
        ]);
    }

    public function test_new_endorsement_creation_is_retired(): void
    {
        $this->actingAs($this->doctor, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson("/api/tb-cases/{$this->case->id}/endorsements", [
                'case_version' => (int) ($this->case->fresh()->version ?: 1),
                'receiving_bhc_id' => $this->bhc->id,
                'note' => 'Should not create.',
            ])
            ->assertStatus(410)
            ->assertJsonPath('message', fn ($message) => is_string($message) && str_contains($message, 'Manage to BHC'));

        $this->actingAs($this->doctor, 'sanctum')
            ->getJson("/api/tb-cases/{$this->case->id}/endorsements")
            ->assertOk()
            ->assertJsonPath('data.can_endorse', false);
    }

    public function test_pending_endorsement_can_still_be_accepted_for_resolution(): void
    {
        $row = TbCaseEndorsement::create([
            'tb_treatment_case_id' => $this->case->id,
            'receiving_bhc_id' => $this->bhc->id,
            'linked_patient_id' => $this->patient->id,
            'patient_snapshot' => ['id' => $this->patient->id, 'first_name' => 'Ada', 'last_name' => 'Lovelace'],
            'note' => 'Historical pending',
            'status' => 'pending_review',
            'endorsed_by' => $this->doctor->id,
            'endorsed_at' => now(),
            'version' => 1,
            'request_key' => (string) Str::uuid(),
            'request_hash' => str_repeat('b', 64),
        ]);

        $this->actingAs($this->receiver, 'sanctum')
            ->postJson("/api/tb-endorsements/{$row->id}/accept", [
                'version' => 1,
                'confirmed' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'accepted');

        $this->actingAs($this->receiver, 'sanctum')
            ->getJson("/api/tb-endorsements/{$row->id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'accepted');
    }

    public function test_dots_observation_writes_are_retired_while_history_remains_readable(): void
    {
        $endorsement = TbCaseEndorsement::create([
            'tb_treatment_case_id' => $this->case->id,
            'receiving_bhc_id' => $this->bhc->id,
            'linked_patient_id' => $this->patient->id,
            'patient_snapshot' => ['id' => $this->patient->id],
            'note' => 'Accepted historically',
            'status' => 'accepted',
            'endorsed_by' => $this->doctor->id,
            'endorsed_at' => now(),
            'reviewed_by' => $this->receiver->id,
            'reviewed_at' => now(),
            'version' => 1,
            'request_key' => (string) Str::uuid(),
            'request_hash' => str_repeat('c', 64),
        ]);

        $this->actingAs($this->receiver, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson("/api/tb-cases/{$this->case->id}/monitoring", [
                'observed_on' => '2026-11-10',
                'dose_status' => 'taken',
                'weight_kg' => 55,
                'notes' => 'Should not record',
                'endorsement_id' => $endorsement->id,
                'endorsement_version' => 1,
            ])
            ->assertStatus(410);

        $this->actingAs($this->receiver, 'sanctum')
            ->getJson("/api/tb-cases/{$this->case->id}/monitoring")
            ->assertOk()
            ->assertJsonPath('data.can_write', false);

        $this->actingAs($this->receiver, 'sanctum')
            ->getJson("/api/tb-cases/{$this->case->id}")
            ->assertOk()
            ->assertJsonPath('data.case_number', 'TB-RETIRE-0001');
    }
}
