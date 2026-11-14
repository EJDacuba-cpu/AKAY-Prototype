<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\RhuServiceUsageReconciliation;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuServiceUsageReconciliationTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Usage RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Usage BHC',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
    }

    public function test_finalize_creates_pending_epi_usage_without_stock_deduction(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $clinician = $this->clinician();
        $uuid = $this->startVisit($clinician, $visit);
        $medicine = Medicine::create([
            'name' => 'PENTA vial',
            'quantity' => 10,
            'unit' => 'vials',
            'availability_status' => 'Available',
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $clinician->id,
        ]);

        $id = $this->postRecord($clinician, $patient, $visit, $uuid, [
            'selected_programs' => ['EPI'],
            'primary_program' => 'EPI',
            'category' => 'Immunization',
            'immunization_data' => [
                'vaccineEntries' => [[
                    'vaccineName' => 'PENTA',
                    'dose' => '2',
                    'dateGiven' => '2026-11-14',
                ]],
            ],
            'monitoring_data' => [
                'selectedPrograms' => ['EPI'],
                'primaryProgram' => 'EPI',
            ],
        ])->assertCreated()->json('data.id');

        $this->assertSame(10, $medicine->fresh()->quantity);
        $usage = RhuServiceUsageReconciliation::query()->where('health_record_id', $id)->first();
        $this->assertNotNull($usage);
        $this->assertSame('EPI', $usage->service_program);
        $this->assertSame('pending', $usage->reconciliation_status);
        $this->assertStringContainsString('PENTA', $usage->item_description);
    }

    public function test_to_dispense_lists_service_usage_and_confirm_deducts_once(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();
        $dispenser = $this->dispenser();
        $record = HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $clinician->id,
            'rural_health_unit_id' => $this->rhu->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'Immunization',
            'chief_complaint' => 'EPI visit',
            'finalized_at' => now(),
            'date_recorded' => now(),
            'immunization_data' => [
                'vaccineEntries' => [[
                    'vaccineName' => 'PENTA',
                    'dose' => '2',
                    'dateGiven' => '2026-11-14',
                ]],
            ],
            'monitoring_data' => [
                'consultationWorkflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'selectedPrograms' => ['EPI'],
                'primaryProgram' => 'EPI',
            ],
        ]);
        app(\App\Services\RhuServiceUsageService::class)->syncPendingFromRecord($record);
        $usage = RhuServiceUsageReconciliation::query()->where('health_record_id', $record->id)->firstOrFail();

        $medicine = Medicine::create([
            'name' => 'PENTA stock',
            'quantity' => 5,
            'unit' => 'vials',
            'availability_status' => 'Available',
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $dispenser->id,
        ]);
        $medicine->expiryGroups()->create([
            'expiration_date' => now()->addYear()->toDateString(),
            'available_quantity' => 5,
            'quarantined_quantity' => 0,
        ]);

        $rows = $this->as($dispenser)->getJson('/api/rhu/to-dispense')->assertOk()->json('data');
        $usageRow = collect($rows)->firstWhere('usageId', $usage->id);
        $this->assertNotNull($usageRow);
        $this->assertSame('SERVICE_USAGE', $usageRow['sourceType']);
        $this->assertSame('pending', $usageRow['status']);

        $this->as($dispenser)
            ->postJson("/api/rhu/service-usages/{$usage->id}/confirm", [
                'medicine_id' => $medicine->id,
                'quantity' => 1,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'reconciled');

        $this->assertSame(4, $medicine->fresh()->quantity);
        $this->assertSame('reconciled', $usage->fresh()->reconciliation_status);

        $this->as($dispenser)
            ->postJson("/api/rhu/service-usages/{$usage->id}/confirm", [
                'medicine_id' => $medicine->id,
                'quantity' => 1,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'reconciled');
        $this->assertSame(4, $medicine->fresh()->quantity);
    }

    public function test_confirm_requires_dispense_permission_and_same_rhu(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();
        $medicine = Medicine::create([
            'name' => 'Guard stock',
            'quantity' => 3,
            'unit' => 'vials',
            'availability_status' => 'Available',
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $clinician->id,
        ]);
        $usage = RhuServiceUsageReconciliation::create([
            'health_record_id' => HealthRecord::create([
                'patient_id' => $patient->id,
                'created_by' => $clinician->id,
                'rural_health_unit_id' => $this->rhu->id,
                'barangay_health_center_id' => $this->bhc->id,
                'category' => 'Immunization',
                'chief_complaint' => 'EPI',
                'finalized_at' => now(),
                'monitoring_data' => ['consultationWorkflow' => HealthRecord::WORKFLOW_RHU_ITR_V1],
            ])->id,
            'patient_id' => $patient->id,
            'rural_health_unit_id' => $this->rhu->id,
            'service_program' => 'EPI',
            'clinical_source_key' => 'epi:test',
            'item_description' => 'PENTA 2',
            'quantity' => 1,
            'unit' => 'dose',
            'reconciliation_status' => 'pending',
        ]);

        $this->as($clinician)
            ->postJson("/api/rhu/service-usages/{$usage->id}/confirm", [
                'medicine_id' => $medicine->id,
                'quantity' => 1,
            ])
            ->assertForbidden();

        $otherRhu = RuralHealthUnit::create(['name' => 'Other', 'status' => 'active']);
        $outsider = User::create([
            'name' => 'Other dispenser',
            'email' => uniqid('', true).'@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'rhu',
            'staff_role' => 'nurse',
            'rural_health_unit_id' => $otherRhu->id,
            'permissions' => ['inventory.view', 'items.dispense'],
        ]);
        $this->as($outsider)
            ->postJson("/api/rhu/service-usages/{$usage->id}/confirm", [
                'medicine_id' => $medicine->id,
                'quantity' => 1,
            ])
            ->assertForbidden();
    }

    private function rhuUser(array $permissions): User
    {
        return User::create([
            'name' => 'Usage Staff',
            'email' => uniqid('', true).'@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'rhu',
            'staff_role' => 'nurse',
            'rural_health_unit_id' => $this->rhu->id,
            'permissions' => $permissions,
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

    private function patient(): Patient
    {
        return Patient::create([
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'sex' => 'Male',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
        ]);
    }

    private function visit(Patient $patient): RhuVisitQueueEntry
    {
        return RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => uniqid('queue-', true),
        ]);
    }

    private function as(User $user): static
    {
        Sanctum::actingAs($user, ['akay:access']);

        return $this;
    }

    private function startVisit(User $user, RhuVisitQueueEntry $visit): string
    {
        return $this->as($user)->postJson("/api/rhu-visits/{$visit->id}/start")
            ->assertOk()
            ->json('data.consultation_uuid');
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
                'chief_complaint' => 'Service visit',
                ...$overrides,
            ]);
    }
}
