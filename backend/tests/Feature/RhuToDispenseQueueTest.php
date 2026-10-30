<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuToDispenseQueueTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Queue RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Queue BHC',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
    }

    public function test_finalized_prescription_appears_pending_without_clinical_history(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $clinician = $this->clinician();
        $uuid = $this->startVisit($clinician, $visit);

        $id = $this->postRecord($clinician, $patient, $visit, $uuid, [
            'prescription_text' => 'Amoxicillin 500mg 1 capsule 3 times a day for 7 days',
        ])->assertCreated()->json('data.id');

        $rows = $this->as($this->dispenser())
            ->getJson('/api/rhu/to-dispense')
            ->assertOk()
            ->json('data');

        $this->assertCount(1, $rows);
        $this->assertSame($id, $rows[0]['id']);
        $this->assertSame($patient->id, $rows[0]['patientId']);
        $this->assertSame($patient->full_name, $rows[0]['patientName']);
        $this->assertSame('Amoxicillin 500mg 1 capsule 3 times a day for 7 days', $rows[0]['prescriptionText']);
        $this->assertSame('pending', $rows[0]['status']);
        $this->assertArrayNotHasKey('diagnoses', $rows[0]);
        $this->assertArrayNotHasKey('monitoring_data', $rows[0]);
    }

    public function test_empty_prescription_and_other_rhu_records_are_absent(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $clinician = $this->clinician();
        $uuid = $this->startVisit($clinician, $visit);
        $this->postRecord($clinician, $patient, $visit, $uuid)->assertCreated();

        $otherRhu = RuralHealthUnit::create(['name' => 'Other queue RHU', 'status' => 'active']);
        $otherBhc = BarangayHealthCenter::create([
            'name' => 'Other queue BHC',
            'status' => 'active',
            'rural_health_unit_id' => $otherRhu->id,
        ]);
        $otherPatient = Patient::create([
            'first_name' => 'Other',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'status' => 'active',
            'barangay_health_center_id' => $otherBhc->id,
            'rural_health_unit_id' => $otherRhu->id,
        ]);
        HealthRecord::create([
            'patient_id' => $otherPatient->id,
            'created_by' => $clinician->id,
            'rural_health_unit_id' => $otherRhu->id,
            'barangay_health_center_id' => $otherBhc->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Pain',
            'finalized_at' => now(),
            'monitoring_data' => [
                'consultationWorkflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'prescriptionText' => 'Ibuprofen 400mg',
            ],
        ]);

        $this->as($this->dispenser())
            ->getJson('/api/rhu/to-dispense')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_queue_requires_dispense_permission(): void
    {
        $this->as($this->clinician())
            ->getJson('/api/rhu/to-dispense')
            ->assertForbidden();
    }

    public function test_post_finalize_dispense_marks_given_and_deducts_stock(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $clinician = $this->clinician();
        $dispenser = $this->dispenser();
        $uuid = $this->startVisit($clinician, $visit);
        $medicine = Medicine::create([
            'name' => 'Window stock',
            'quantity' => 8,
            'unit' => 'tablets',
            'availability_status' => 'Available',
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $dispenser->id,
        ]);
        $medicine->expiryGroups()->create([
            'expiration_date' => now()->addYear()->toDateString(),
            'available_quantity' => 8,
            'quarantined_quantity' => 0,
        ]);

        $id = $this->postRecord($clinician, $patient, $visit, $uuid, [
            'prescription_text' => 'Window stock 2 tablets',
        ])->assertCreated()->json('data.id');

        $this->as($dispenser)
            ->postJson("/api/health-records/{$id}/dispensed-medicines", [
                'dispensed_medicines' => [['medicine_id' => $medicine->id, 'quantity' => 2]],
            ])
            ->assertOk();

        $this->assertSame(6, $medicine->fresh()->quantity);
        $this->as($dispenser)
            ->getJson('/api/rhu/to-dispense')
            ->assertOk()
            ->assertJsonPath('data.0.status', 'given');
    }

    public function test_legacy_catalog_prescription_lines_still_queue(): void
    {
        $patient = $this->patient();
        HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $this->clinician()->id,
            'rural_health_unit_id' => $this->rhu->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Cough',
            'finalized_at' => now(),
            'date_recorded' => now(),
            'monitoring_data' => [
                'consultationWorkflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'prescribedMedicines' => [[
                    'name' => 'Losartan 50mg',
                    'quantity' => 14,
                    'unit' => 'tablets',
                    'instructions' => 'Once daily after breakfast',
                ]],
            ],
        ]);

        $this->as($this->dispenser())
            ->getJson('/api/rhu/to-dispense')
            ->assertOk()
            ->assertJsonPath('data.0.status', 'pending')
            ->assertJsonPath('data.0.prescriptionText', 'Losartan 50mg · 14 tablets · Once daily after breakfast');
    }

    private function rhuUser(array $permissions, array $attributes = []): User
    {
        return User::create([
            'name' => 'Queue Staff',
            'email' => uniqid('', true).'@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'rhu',
            'staff_role' => 'nurse',
            'rural_health_unit_id' => $this->rhu->id,
            'permissions' => $permissions,
            ...$attributes,
        ]);
    }

    private function clinician(): User
    {
        return $this->rhuUser([
            ...StaffRoles::defaults('doctor'),
            'consultations.encode',
            'consultations.finalize',
        ]);
    }

    private function dispenser(): User
    {
        return $this->rhuUser([
            'inventory.view',
            'items.dispense',
        ]);
    }

    private function patient(array $attributes = []): Patient
    {
        return Patient::create([
            'first_name' => 'Maria',
            'last_name' => 'Santos',
            'sex' => 'Female',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            ...$attributes,
        ]);
    }

    private function visit(Patient $patient, array $attributes = []): RhuVisitQueueEntry
    {
        return RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => uniqid('queue-', true),
            ...$attributes,
        ]);
    }

    private function as(User $user): static
    {
        Sanctum::actingAs($user, ['akay:access']);

        return $this;
    }

    private function startVisit(User $user, RhuVisitQueueEntry $visit): string
    {
        $uuid = $this->as($user)->postJson("/api/rhu-visits/{$visit->id}/start")
            ->assertOk()
            ->json('data.consultation_uuid');
        $this->assertNotEmpty($uuid);

        return $uuid;
    }

    private function postRecord(User $user, Patient $patient, RhuVisitQueueEntry $visit, string $uuid, array $overrides = [])
    {
        return $this->as($user)
            ->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
            ->postJson('/api/health-records', [
                'consultation_workflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'consultation_uuid' => $uuid,
                'rhu_visit_id' => $visit->id,
                'patient_id' => $patient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Cough and fever',
                ...$overrides,
            ]);
    }
}
