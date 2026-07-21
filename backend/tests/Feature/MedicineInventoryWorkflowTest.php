<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Medicine;
use App\Models\MedicineInventoryTransaction;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Models\HealthRecord;
use App\Services\MedicineStockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class MedicineInventoryWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;
    private BarangayHealthCenter $bhc;
    private BarangayHealthCenter $otherBhc;
    private User $bhw;
    private User $otherBhw;
    private User $rhuStaff;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhu = RuralHealthUnit::create(['name' => 'Inventory Workflow RHU']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Inventory Workflow BHC',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->otherBhc = BarangayHealthCenter::create([
            'name' => 'Other Inventory BHC',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->bhw = $this->user('Inventory BHW', 'inventory-bhw@example.test', User::ROLE_BHW, $this->bhc->id);
        $this->otherBhw = $this->user('Other BHW', 'other-inventory-bhw@example.test', User::ROLE_BHW, $this->otherBhc->id);
        $this->rhuStaff = $this->user('Inventory RHU', 'inventory-rhu@example.test', User::ROLE_RHU_STAFF, null, $this->rhu->id);
    }

    public function test_creation_derives_facility_and_records_only_positive_opening_balance(): void
    {
        $positive = $this->actingAs($this->bhw, 'sanctum')->postJson('/api/medicines', [
            'name' => 'Opening Balance Medicine',
            'category' => 'Basic Medicines',
            'quantity' => 12,
            'unit' => 'tablets',
            'low_stock_threshold' => 5,
        ])->assertCreated();

        $medicineId = $positive->json('data.id');
        $this->assertDatabaseHas('medicines', [
            'id' => $medicineId,
            'quantity' => 12,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => null,
        ]);
        $this->assertDatabaseHas('medicine_inventory_transactions', [
            'medicine_id' => $medicineId,
            'transaction_type' => 'opening_balance',
            'quantity_delta' => 12,
            'quantity_before' => 0,
            'quantity_after' => 12,
        ]);

        $zero = $this->actingAs($this->rhuStaff, 'sanctum')->postJson('/api/medicines', [
            'name' => 'Zero Opening Medicine',
            'quantity' => 0,
            'rural_health_unit_id' => 999999,
        ])->assertUnprocessable();

        $this->actingAs($this->rhuStaff, 'sanctum')->postJson('/api/medicines', [
            'name' => 'Zero Opening Medicine',
            'quantity' => 0,
        ])->assertCreated();

        $zeroMedicine = Medicine::where('name', 'Zero Opening Medicine')->firstOrFail();
        $this->assertSame($this->rhu->id, $zeroMedicine->rural_health_unit_id);
        $this->assertSame(0, $zeroMedicine->inventoryTransactions()->count());
        $this->assertNull($zero->json('data'));
    }

    public function test_negative_opening_balance_and_client_facility_override_fail_validation(): void
    {
        $this->actingAs($this->bhw, 'sanctum')->postJson('/api/medicines', [
            'name' => 'Negative Opening',
            'quantity' => -1,
        ])->assertUnprocessable();

        $this->actingAs($this->bhw, 'sanctum')->postJson('/api/medicines', [
            'name' => 'Overridden Facility',
            'quantity' => 1,
            'barangay_health_center_id' => $this->otherBhc->id,
        ])->assertUnprocessable();

        $this->assertDatabaseMissing('medicines', ['name' => 'Negative Opening']);
        $this->assertDatabaseMissing('medicines', ['name' => 'Overridden Facility']);
    }

    public function test_authorized_bhc_and_rhu_restock_increment_and_create_one_ledger_row(): void
    {
        $bhcMedicine = $this->medicine('BHC Restock', 4, $this->bhc->id);
        $rhuMedicine = $this->medicine('RHU Restock', 7, null, $this->rhu->id);

        $this->actingAs($this->bhw, 'sanctum')
            ->postJson("/api/medicines/{$bhcMedicine->id}/restock", [
                'quantity' => 6,
                'reason' => 'Monthly BHC replenishment',
            ])
            ->assertOk()
            ->assertJsonPath('data.medicine.quantity', 10)
            ->assertJsonPath('data.transaction.quantity_before', 4)
            ->assertJsonPath('data.transaction.quantity_after', 10)
            ->assertJsonPath('data.transaction.quantity_delta', 6);

        $this->actingAs($this->rhuStaff, 'sanctum')
            ->postJson("/api/medicines/{$rhuMedicine->id}/restock", [
                'quantity' => 3,
                'reason' => 'RHU delivery receipt',
            ])
            ->assertOk()
            ->assertJsonPath('data.medicine.quantity', 10);

        $this->assertDatabaseCount('medicine_inventory_transactions', 2);
    }

    public function test_restock_requires_reason_and_rejects_cross_facility_access(): void
    {
        $medicine = $this->medicine('Restricted Restock', 2, $this->bhc->id);

        $this->actingAs($this->bhw, 'sanctum')
            ->postJson("/api/medicines/{$medicine->id}/restock", ['quantity' => 1])
            ->assertUnprocessable();
        $this->actingAs($this->otherBhw, 'sanctum')
            ->postJson("/api/medicines/{$medicine->id}/restock", [
                'quantity' => 1,
                'reason' => 'Unauthorized attempt',
            ])
            ->assertForbidden();

        $this->assertSame(2, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
    }

    public function test_adjustment_actions_use_positive_input_and_record_signed_deltas(): void
    {
        $medicine = $this->medicine('Adjustment Medicine', 20, $this->bhc->id);

        foreach ([
            ['adjustment_in', 2, null, 22, 2],
            ['adjustment_out', 3, null, 19, -3],
            ['damaged_disposal', 4, null, 15, -4],
            ['correction', 1, 'in', 16, 1],
            ['correction', 2, 'out', 14, -2],
        ] as [$action, $quantity, $direction, $after, $delta]) {
            $payload = [
                'action' => $action,
                'quantity' => $quantity,
                'reason' => "Controlled {$action} test",
            ];
            if ($direction) {
                $payload['direction'] = $direction;
            }

            $this->actingAs($this->bhw, 'sanctum')
                ->postJson("/api/medicines/{$medicine->id}/adjust", $payload)
                ->assertOk()
                ->assertJsonPath('data.transaction.quantity_after', $after)
                ->assertJsonPath('data.transaction.quantity_delta', $delta);
        }

        $this->assertSame(14, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('medicine_inventory_transactions', 5);
    }

    public function test_expired_disposal_succeeds_but_invalid_or_excessive_outflow_does_not_mutate(): void
    {
        $expired = $this->medicine('Expired Disposal', 8, $this->bhc->id, null, [
            'expiration_date' => now()->subDay()->toDateString(),
        ]);

        $this->actingAs($this->bhw, 'sanctum')
            ->postJson("/api/medicines/{$expired->id}/adjust", [
                'action' => 'expired_disposal',
                'quantity' => 3,
                'reason' => 'Expired batch segregation',
            ])
            ->assertOk()
            ->assertJsonPath('data.medicine.quantity', 5);

        $active = $this->medicine('Active Disposal', 2, $this->bhc->id);
        $this->actingAs($this->bhw, 'sanctum')
            ->postJson("/api/medicines/{$active->id}/adjust", [
                'action' => 'expired_disposal',
                'quantity' => 1,
                'reason' => 'Not actually expired',
            ])
            ->assertUnprocessable();
        $this->actingAs($this->bhw, 'sanctum')
            ->postJson("/api/medicines/{$active->id}/adjust", [
                'action' => 'adjustment_out',
                'quantity' => 3,
                'reason' => 'Excessive deduction',
            ])
            ->assertConflict()
            ->assertJsonPath('code', 'INVENTORY_CONFLICT');

        $this->assertSame(2, $active->fresh()->quantity);
        $this->assertSame(1, $expired->inventoryTransactions()->count());
    }

    public function test_generic_metadata_update_cannot_replace_quantity(): void
    {
        $medicine = $this->medicine('Metadata Medicine', 11, $this->bhc->id);

        $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/medicines/{$medicine->id}", [
                'name' => 'Updated Metadata Medicine',
                'low_stock_threshold' => 15,
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Metadata Medicine');
        $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/medicines/{$medicine->id}", ['quantity' => 99])
            ->assertUnprocessable();

        $this->assertSame(11, $medicine->fresh()->quantity);
        $this->assertSame('Updated Metadata Medicine', $medicine->fresh()->name);
    }

    public function test_used_medicine_is_archived_while_unused_zero_stock_can_be_deleted(): void
    {
        $used = $this->medicine('Used Medicine', 1, $this->bhc->id);
        MedicineInventoryTransaction::create([
            'medicine_id' => $used->id,
            'actor_user_id' => $this->bhw->id,
            'transaction_type' => 'opening_balance',
            'quantity_delta' => 1,
            'quantity_before' => 0,
            'quantity_after' => 1,
            'source_type' => 'opening_balance',
            'source_id' => $used->id,
            'operation_key' => "test-used:{$used->id}",
        ]);
        $unused = $this->medicine('Unused Zero Medicine', 0, $this->bhc->id);

        $this->actingAs($this->bhw, 'sanctum')
            ->deleteJson("/api/medicines/{$used->id}")
            ->assertOk();
        $this->actingAs($this->bhw, 'sanctum')
            ->deleteJson("/api/medicines/{$unused->id}")
            ->assertNoContent();

        $this->assertFalse($used->fresh()->is_active);
        $this->assertNotNull($used->fresh()->archived_at);
        $this->assertDatabaseMissing('medicines', ['id' => $unused->id]);
    }

    public function test_history_is_paginated_newest_first_and_facility_scoped(): void
    {
        $medicine = $this->medicine('History Medicine', 5, $this->bhc->id);
        foreach ([1, 2] as $quantity) {
            $this->actingAs($this->bhw, 'sanctum')
                ->postJson("/api/medicines/{$medicine->id}/restock", [
                    'quantity' => $quantity,
                    'reason' => "History restock {$quantity}",
                ])->assertOk();
        }

        $response = $this->actingAs($this->bhw, 'sanctum')
            ->getJson("/api/medicines/{$medicine->id}/transactions?per_page=1")
            ->assertOk()
            ->assertJsonPath('data.per_page', 1)
            ->assertJsonPath('data.data.0.quantity_delta', 2)
            ->assertJsonPath('data.data.0.actor.name', $this->bhw->name);
        $this->assertArrayNotHasKey('email', $response->json('data.data.0.actor'));

        $this->actingAs($this->otherBhw, 'sanctum')
            ->getJson("/api/medicines/{$medicine->id}/transactions")
            ->assertForbidden();
    }

    public function test_duplicate_restock_operation_key_increases_stock_only_once(): void
    {
        $medicine = $this->medicine('Idempotent Restock', 5, $this->bhc->id);
        $request = $this->requestFor($this->bhw);
        $service = app(MedicineStockService::class);
        $operationKey = 'restock-concurrency-key';

        DB::transaction(fn () => $service->restock(
            $request,
            $medicine,
            4,
            'Concurrent restock winner',
            $operationKey
        ));

        $this->assertInventoryError(
            fn () => DB::transaction(fn () => $service->restock(
                $request,
                $medicine->fresh(),
                4,
                'Concurrent restock loser',
                $operationKey
            )),
            'INVENTORY_OPERATION_ALREADY_APPLIED'
        );

        $this->assertSame(9, $medicine->fresh()->quantity);
        $this->assertSame(1, MedicineInventoryTransaction::query()
            ->where('operation_key', $operationKey)
            ->where('medicine_id', $medicine->id)
            ->count());
    }

    public function test_duplicate_adjustment_operation_key_adjusts_stock_only_once(): void
    {
        $medicine = $this->medicine('Idempotent Adjustment', 10, $this->bhc->id);
        $request = $this->requestFor($this->bhw);
        $service = app(MedicineStockService::class);
        $operationKey = 'adjustment-concurrency-key';

        DB::transaction(fn () => $service->adjust(
            $request,
            $medicine,
            'adjustment_out',
            3,
            'Concurrent adjustment winner',
            null,
            $operationKey
        ));

        $this->assertInventoryError(
            fn () => DB::transaction(fn () => $service->adjust(
                $request,
                $medicine->fresh(),
                'adjustment_out',
                3,
                'Concurrent adjustment loser',
                null,
                $operationKey
            )),
            'INVENTORY_OPERATION_ALREADY_APPLIED'
        );

        $this->assertSame(7, $medicine->fresh()->quantity);
        $this->assertSame(1, MedicineInventoryTransaction::query()
            ->where('operation_key', $operationKey)
            ->where('medicine_id', $medicine->id)
            ->count());
    }

    public function test_batch_key_supports_multiple_medicines_but_same_batch_cannot_repeat(): void
    {
        $first = $this->medicine('Batch Key Medicine A', 10, $this->bhc->id);
        $second = $this->medicine('Batch Key Medicine B', 8, $this->bhc->id);
        $patient = Patient::create([
            'first_name' => 'Batch',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $record = HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
        ]);
        $items = [
            ['medicine_id' => $first->id, 'quantity' => 2],
            ['medicine_id' => $second->id, 'quantity' => 3],
        ];
        $request = $this->requestFor($this->bhw);
        $service = app(MedicineStockService::class);
        $operationKey = "health-record:{$record->id}:dispense";

        DB::transaction(fn () => $service->dispense($request, $record, $items));

        $this->assertInventoryError(
            fn () => DB::transaction(fn () => $service->dispense(
                $request,
                $record->fresh(),
                $items
            )),
            'INVENTORY_OPERATION_ALREADY_APPLIED'
        );

        $this->assertSame(8, $first->fresh()->quantity);
        $this->assertSame(5, $second->fresh()->quantity);
        $this->assertSame(2, MedicineInventoryTransaction::query()
            ->where('operation_key', $operationKey)
            ->count());
        $this->assertDatabaseCount('health_record_medicines', 2);
    }

    public function test_composite_operation_key_allows_different_medicines_but_rejects_same_pair(): void
    {
        $first = $this->medicine('Composite Key A', 1, $this->bhc->id);
        $second = $this->medicine('Composite Key B', 1, $this->bhc->id);
        $key = 'shared-composite-key';

        foreach ([$first, $second] as $medicine) {
            MedicineInventoryTransaction::create([
                'medicine_id' => $medicine->id,
                'actor_user_id' => $this->bhw->id,
                'transaction_type' => 'opening_balance',
                'quantity_delta' => 1,
                'quantity_before' => 0,
                'quantity_after' => 1,
                'source_type' => 'opening_balance',
                'source_id' => $medicine->id,
                'operation_key' => $key,
            ]);
        }

        $this->assertSame(2, MedicineInventoryTransaction::where('operation_key', $key)->count());

        try {
            MedicineInventoryTransaction::create([
                'medicine_id' => $first->id,
                'actor_user_id' => $this->bhw->id,
                'transaction_type' => 'restock',
                'quantity_delta' => 1,
                'quantity_before' => 1,
                'quantity_after' => 2,
                'source_type' => 'manual_restock',
                'source_id' => $first->id,
                'reason' => 'Duplicate composite key test',
                'operation_key' => $key,
            ]);
            $this->fail('The same operation key and medicine pair should be unique.');
        } catch (\Illuminate\Database\QueryException) {
            $this->assertSame(2, MedicineInventoryTransaction::where('operation_key', $key)->count());
        }

        try {
            MedicineInventoryTransaction::create([
                'medicine_id' => $second->id,
                'actor_user_id' => $this->bhw->id,
                'transaction_type' => 'restock',
                'quantity_delta' => 1,
                'quantity_before' => 1,
                'quantity_after' => 2,
                'source_type' => 'manual_restock',
                'source_id' => $second->id,
                'reason' => 'Missing operation key test',
            ]);
            $this->fail('Official inventory ledger rows must have an operation key.');
        } catch (\Illuminate\Database\QueryException) {
            $this->assertSame(2, MedicineInventoryTransaction::where('operation_key', $key)->count());
        }
    }

    public function test_rhu_health_record_dispensing_is_rejected_and_rolled_back(): void
    {
        $patient = Patient::create([
            'first_name' => 'RHU',
            'last_name' => 'Dispense Rejection',
            'sex' => 'Female',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $medicine = $this->medicine('RHU Inventory Item', 9, null, $this->rhu->id);

        $this->actingAs($this->rhuStaff, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $patient->id,
                'category' => 'General Consultation',
                'dispensed_medicines' => [[
                    'medicine_id' => $medicine->id,
                    'quantity' => 2,
                ]],
            ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Medicine dispensing is only available for BHC visits.');

        $this->assertSame(9, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('health_record_medicines', 0);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
    }

    public function test_non_correction_direction_is_rejected(): void
    {
        $medicine = $this->medicine('Direction Validation', 5, $this->bhc->id);

        $this->actingAs($this->bhw, 'sanctum')
            ->postJson("/api/medicines/{$medicine->id}/adjust", [
                'action' => 'adjustment_out',
                'direction' => 'in',
                'quantity' => 1,
                'reason' => 'Direction must not be accepted here',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('direction');

        $this->assertSame(5, $medicine->fresh()->quantity);
    }

    private function medicine(
        string $name,
        int $quantity,
        ?int $bhcId = null,
        ?int $rhuId = null,
        array $overrides = []
    ): Medicine {
        return Medicine::create([
            'name' => $name,
            'category' => 'Basic Medicines',
            'quantity' => $quantity,
            'unit' => 'tablets',
            'availability_status' => $quantity > 0 ? 'Available' : 'Unavailable',
            'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $rhuId,
            'created_by' => $bhcId ? $this->bhw->id : $this->rhuStaff->id,
            ...$overrides,
        ]);
    }

    private function user(
        string $name,
        string $email,
        string $role,
        ?int $bhcId = null,
        ?int $rhuId = null
    ): User {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $rhuId,
        ]);
    }

    private function requestFor(User $user): Request
    {
        $request = Request::create('/api/medicines', 'POST');
        $request->setUserResolver(fn (): User => $user);

        return $request;
    }

    private function assertInventoryError(callable $callback, string $code): void
    {
        try {
            $callback();
            $this->fail("Expected inventory error {$code}.");
        } catch (HttpResponseException $exception) {
            $this->assertSame(409, $exception->getResponse()->getStatusCode());
            $this->assertSame($code, $exception->getResponse()->getData(true)['code'] ?? null);
        }
    }
}
