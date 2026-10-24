<?php

namespace Tests\Feature;

use App\Services\AuditLogger;
use App\Services\HealthRecordIdempotencyService;
use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Mockery\MockInterface;
use Tests\TestCase;

class MedicineStockConcurrencyTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;
    private BarangayHealthCenter $bhc;
    private User $bhw;
    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhu = RuralHealthUnit::create(['name' => 'Stock Protection RHU']);
        $this->seedAvailableProvider($this->rhu);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Stock Protection BHC',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->bhw = $this->user('Stock BHW', 'stock-bhw@example.test', $this->bhc);
        $this->patient = $this->patient('Stock', 'Patient', $this->bhc);
    }

    public function test_authorized_submission_deducts_locked_stock_and_creates_one_normalized_history_row(): void
    {
        $medicine = $this->medicine('Paracetamol', 10);

        $response = $this->postRecord($this->payload([
            'dispensed_medicines' => [
                ['medicine_id' => $medicine->id, 'confirmed_given' => true, 'quantity' => 2, 'remarks' => 'Morning'],
                ['medicine_id' => $medicine->id, 'confirmed_given' => true, 'quantity' => 3, 'remarks' => 'Clinic dose'],
            ],
        ]), (string) Str::uuid())->assertCreated();

        $this->assertSame(5, $medicine->fresh()->quantity);
        $this->assertDatabaseHas('health_record_medicines', [
            'health_record_id' => $response->json('data.id'),
            'medicine_id' => $medicine->id,
            'quantity' => 5,
            'dispensed_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $this->assertDatabaseCount('health_record_medicines', 1);
        $this->assertDatabaseHas('medicine_inventory_transactions', [
            'medicine_id' => $medicine->id,
            'transaction_type' => 'dispense',
            'quantity_delta' => -5,
            'quantity_before' => 10,
            'quantity_after' => 5,
            'source_type' => 'health_record',
            'source_id' => $response->json('data.id'),
        ]);
    }

    public function test_undispensable_medicine_rejects_and_creates_no_official_effects(): void
    {
        // A shortage no longer blocks finalization (docs/consultation-workflow-revision.md);
        // an undispensable item still rolls back every official effect.
        $medicine = $this->medicine('Amoxicillin', 5, ['expiration_date' => now()->subDay()->toDateString()]);

        $this->postRecord($this->payload([
            'needs_referral' => true,
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'confirmed_given' => true,
                'quantity' => 4,
            ]],
            'referral' => [
                'urgency_level' => 'Routine',
                'reason_for_referral' => 'Requires additional assessment.',
            ],
        ]), (string) Str::uuid())
            ->assertUnprocessable()
            ->assertJsonPath('code', 'MEDICINE_NOT_DISPENSABLE');

        $this->assertSame(5, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('health_record_medicines', 0);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertDatabaseCount('follow_up_tasks', 0);
        $this->assertDatabaseCount('audit_logs', 0);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_different_keys_use_current_stock_while_same_key_replays_without_another_deduction(): void
    {
        $medicine = $this->medicine('Cotrimoxazole', 5);
        $payload = $this->payload([
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'confirmed_given' => true,
                'quantity' => 4,
            ]],
        ]);
        $winnerKey = (string) Str::uuid();

        $winner = $this->postRecord($payload, $winnerKey)->assertCreated();
        $recordId = $winner->json('data.id');

        $this->postRecord($payload, $winnerKey)
            ->assertOk()
            ->assertJsonPath('idempotent_replay', true)
            ->assertJsonPath('result.health_record_id', $recordId);

        // A new key uses current stock: the shortage posts and flags reconciliation.
        $this->postRecord($payload, (string) Str::uuid())->assertCreated();
        $this->assertTrue($medicine->fresh()->reconciliation_required);

        $this->postRecord([
            ...$payload,
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'confirmed_given' => true,
                'quantity' => 3,
            ]],
        ], $winnerKey)
            ->assertConflict()
            ->assertJsonPath('code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');

        $this->assertSame(0, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 2);
        $this->assertDatabaseCount('health_record_medicines', 2);
        $this->assertDatabaseCount('medicine_inventory_transactions', 2);
    }

    public function test_all_rows_are_validated_before_any_multi_item_deduction(): void
    {
        $first = $this->medicine('First Medicine', 10);
        $second = $this->medicine('Second Medicine', 1, ['expiration_date' => now()->subDay()->toDateString()]);

        $this->postRecord($this->payload([
            'dispensed_medicines' => [
                ['medicine_id' => $second->id, 'confirmed_given' => true, 'quantity' => 3],
                ['medicine_id' => $first->id, 'confirmed_given' => true, 'quantity' => 2],
            ],
        ]), (string) Str::uuid())
            ->assertUnprocessable()
            ->assertJsonPath('code', 'MEDICINE_NOT_DISPENSABLE');

        $this->assertSame(10, $first->fresh()->quantity);
        $this->assertSame(1, $second->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('health_record_medicines', 0);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
    }

    public function test_multiple_sufficient_items_deduct_once_regardless_of_browser_order(): void
    {
        $first = $this->medicine('First Sufficient Medicine', 8);
        $second = $this->medicine('Second Sufficient Medicine', 9);

        $this->postRecord($this->payload([
            'dispensed_medicines' => [
                ['medicine_id' => $second->id, 'confirmed_given' => true, 'quantity' => 4],
                ['medicine_id' => $first->id, 'confirmed_given' => true, 'quantity' => 3],
            ],
        ]), (string) Str::uuid())->assertCreated();

        $this->assertSame(5, $first->fresh()->quantity);
        $this->assertSame(5, $second->fresh()->quantity);
        $this->assertDatabaseCount('health_record_medicines', 2);
    }

    public function test_idempotency_hash_normalizes_reordered_and_combined_medicine_entries(): void
    {
        $first = $this->medicine('Hash Medicine A', 10);
        $second = $this->medicine('Hash Medicine B', 10);
        $key = (string) Str::uuid();
        $payload = $this->payload([
            'dispensed_medicines' => [
                ['medicine_id' => $first->id, 'confirmed_given' => true, 'quantity' => 2],
                ['medicine_id' => $first->id, 'confirmed_given' => true, 'quantity' => 3],
                ['medicine_id' => $second->id, 'confirmed_given' => true, 'quantity' => 1],
            ],
        ]);

        $created = $this->postRecord($payload, $key)->assertCreated();

        $this->postRecord([
            ...$payload,
            'dispensed_medicines' => [
                ['medicine_id' => $second->id, 'confirmed_given' => true, 'quantity' => 1],
                ['medicine_id' => $first->id, 'confirmed_given' => true, 'quantity' => 5],
            ],
        ], $key)
            ->assertOk()
            ->assertJsonPath('idempotent_replay', true)
            ->assertJsonPath('data.id', $created->json('data.id'));

        $this->assertSame(5, $first->fresh()->quantity);
        $this->assertSame(9, $second->fresh()->quantity);
        $this->assertDatabaseCount('health_record_medicines', 2);
    }

    public function test_pre_phase_2c_medicine_hash_remains_replayable(): void
    {
        $medicine = $this->medicine('Legacy Hash Medicine', 8);
        $key = (string) Str::uuid();
        $payload = $this->payload([
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'confirmed_given' => true,
                'quantity' => 2,
            ]],
        ]);
        // The server hashes the request after resolving diagnoses, which is always present.
        $legacyHash = app(HealthRecordIdempotencyService::class)->legacyHash([
            ...$payload,
            'diagnoses' => [],
            'idempotency_key' => $key,
        ]);
        $record = HealthRecord::create([
            'idempotency_key' => $key,
            'idempotency_hash' => $legacyHash,
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
        ]);

        $this->postRecord($payload, $key)
            ->assertOk()
            ->assertJsonPath('idempotent_replay', true)
            ->assertJsonPath('data.id', $record->id);

        $this->assertSame(8, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_record_medicines', 0);
    }

    public function test_cross_facility_inventory_is_rejected_without_stock_details(): void
    {
        $otherBhc = BarangayHealthCenter::create([
            'name' => 'Other Stock BHC',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $otherBhw = $this->user('Other Stock BHW', 'other-stock-bhw@example.test', $otherBhc);
        $otherMedicine = Medicine::create([
            'name' => 'Private Facility Medicine',
            'category' => 'Medicine',
            'quantity' => 37,
            'unit' => 'tablet',
            'availability_status' => 'Available',
            'barangay_health_center_id' => $otherBhc->id,
            'created_by' => $otherBhw->id,
        ]);

        $response = $this->postRecord($this->payload([
            'dispensed_medicines' => [[
                'medicine_id' => $otherMedicine->id,
                'confirmed_given' => true,
                'quantity' => 1,
                'barangay_health_center_id' => $this->bhc->id,
            ]],
        ]), (string) Str::uuid())->assertUnprocessable();

        $this->assertNull($response->json('items'));
        $this->assertSame(37, $otherMedicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_undispensable_medicine_leaves_linked_follow_up_active_and_creates_no_next_task(): void
    {
        [$parent, $task] = $this->scheduledFollowUp();
        $medicine = $this->medicine('Follow-up Medicine', 2, ['expiration_date' => now()->subDay()->toDateString()]);

        $this->postRecord($this->followUpPayload($parent, $task, [
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'confirmed_given' => true,
                'quantity' => 3,
            ]],
            'monitoring_data' => [
                'followUpTaskId' => $task->id,
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-09-01',
                'followUpTime' => '09:00',
            ],
        ]), (string) Str::uuid())
            ->assertUnprocessable()
            ->assertJsonPath('code', 'MEDICINE_NOT_DISPENSABLE');

        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $this->assertNull($task->fresh()->fulfilled_at);
        $this->assertSame(2, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('follow_up_tasks', 1);
        $this->assertDatabaseCount('health_record_medicines', 0);
    }

    public function test_processed_follow_up_conflict_precedes_stock_validation(): void
    {
        [$parent, $task] = $this->scheduledFollowUp();
        $completedRecord = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => $parent->category,
        ]);
        $task->update([
            'state' => FollowUpTask::STATE_FULFILLED,
            'fulfilled_at' => now(),
            'fulfilled_by_health_record_id' => $completedRecord->id,
        ]);
        $medicine = $this->medicine('Processed Follow-up Medicine', 0);

        $this->postRecord($this->followUpPayload($parent, $task, [
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'confirmed_given' => true,
                'quantity' => 5,
            ]],
        ]), (string) Str::uuid())
            ->assertConflict()
            ->assertJsonPath('code', 'FOLLOW_UP_ALREADY_PROCESSED')
            ->assertJsonPath('health_record_id', $completedRecord->id);

        $this->assertSame(0, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_record_medicines', 0);
    }

    public function test_invalid_quantity_expired_and_missing_items_create_no_effects(): void
    {
        $unavailable = $this->medicine('Unavailable Medicine', 5, [
            'availability_status' => 'Unavailable',
        ]);
        $expired = $this->medicine('Expired Medicine', 5, [
            'expiration_date' => now()->subDay()->toDateString(),
        ]);

        foreach ([0, -1, 'not-a-number', 2147483648] as $quantity) {
            $this->postRecord($this->payload([
                'dispensed_medicines' => [[
                    'medicine_id' => $unavailable->id,
                    'confirmed_given' => true,
                    'quantity' => $quantity,
                ]],
            ]), (string) Str::uuid())->assertUnprocessable();
        }

        $this->postRecord($this->payload([
            'dispensed_medicines' => [[
                'medicine_id' => $expired->id,
                'confirmed_given' => true,
                'quantity' => 1,
            ]],
        ]), (string) Str::uuid())->assertUnprocessable();

        $this->postRecord($this->payload([
            'dispensed_medicines' => [[
                'medicine_id' => 999999,
                'confirmed_given' => true,
                'quantity' => 1,
            ]],
        ]), (string) Str::uuid())->assertUnprocessable();

        $this->assertSame(5, $unavailable->fresh()->quantity);
        $this->assertSame(5, $expired->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('health_record_medicines', 0);
    }

    public function test_health_record_without_medicines_still_succeeds(): void
    {
        $this->postRecord($this->payload(), (string) Str::uuid())->assertCreated();

        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('health_record_medicines', 0);
    }

    public function test_late_audit_failure_rolls_back_record_stock_and_history(): void
    {
        $medicine = $this->medicine('Audit Rollback Medicine', 7);
        $this->mock(AuditLogger::class, function (MockInterface $mock): void {
            $mock->shouldReceive('log')
                ->once()
                ->andThrow(new \RuntimeException('Forced audit persistence failure.'));
        });

        $this->postRecord($this->payload([
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'confirmed_given' => true,
                'quantity' => 3,
            ]],
        ]), (string) Str::uuid())->assertInternalServerError();

        $this->assertSame(7, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('health_record_medicines', 0);
        $this->assertDatabaseCount('audit_logs', 0);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
    }

    public function test_direct_dispense_endpoint_deducts_once_for_an_existing_record(): void
    {
        $medicine = $this->medicine('Direct Dispense Medicine', 6);
        $record = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
        ]);
        $payload = [
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'confirmed_given' => true,
                'quantity' => 2,
            ]],
        ];

        $this->actingAs($this->bhw, 'sanctum')
            ->postJson("/api/health-records/{$record->id}/dispensed-medicines", $payload)
            ->assertOk();
        $this->actingAs($this->bhw, 'sanctum')
            ->postJson("/api/health-records/{$record->id}/dispensed-medicines", $payload)
            ->assertUnprocessable();

        $this->assertSame(4, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_record_medicines', 1);
    }

    private function postRecord(array $payload, string $key)
    {
        return $this->actingAs($this->bhw, 'sanctum')
            ->withHeader('Idempotency-Key', $key)
            ->postJson('/api/health-records', $payload);
    }

    private function payload(array $overrides = []): array
    {
        return [
            'patient_id' => $this->patient->id,
            'date_recorded' => '2026-07-20 09:30:00',
            'category' => 'General Consultation',
            'chief_complaint' => 'Stock protection test',
            'diagnosis' => 'Assessed at BHC',
            ...$overrides,
        ];
    }

    private function followUpPayload(
        HealthRecord $parent,
        FollowUpTask $task,
        array $overrides = []
    ): array {
        return $this->payload([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'category' => $parent->category,
            'monitoring_data' => [
                'followUpTaskId' => $task->id,
                'followUpStatus' => 'Routine Monitoring',
            ],
            ...$overrides,
        ]);
    }

    private function scheduledFollowUp(): array
    {
        $parent = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-01',
            ],
        ]);
        $task = FollowUpTask::create([
            'health_record_id' => $parent->id,
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'due_date' => '2026-08-01',
            'state' => FollowUpTask::STATE_PENDING,
            'created_by' => $this->bhw->id,
        ]);

        return [$parent, $task];
    }

    private function medicine(string $name, int $quantity, array $overrides = []): Medicine
    {
        return Medicine::create([
            'name' => $name,
            'category' => 'Medicine',
            'quantity' => $quantity,
            'unit' => 'tablet',
            'availability_status' => 'Available',
            'barangay_health_center_id' => $this->bhc->id,
            'created_by' => $this->bhw->id,
            ...$overrides,
        ]);
    }

    private function patient(
        string $firstName,
        string $lastName,
        BarangayHealthCenter $bhc
    ): Patient {
        return Patient::create([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
            'created_by' => $this->bhw?->id,
        ]);
    }

    private function user(
        string $name,
        string $email,
        BarangayHealthCenter $bhc
    ): User {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHC,
            'staff_role' => 'midwife',
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);
    }
}
