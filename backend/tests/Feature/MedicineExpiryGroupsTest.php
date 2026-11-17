<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\HealthRecordMedicine;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\HealthRecordIdempotencyService;
use App\Services\MedicineStockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class MedicineExpiryGroupsTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 10, 28)->setTime(12, 0));
        $rhu = RuralHealthUnit::create(['name' => 'Expiry RHU']);
        $bhc = BarangayHealthCenter::create(['name' => 'Expiry BHC', 'rural_health_unit_id' => $rhu->id]);
        $this->staff = User::create(['name' => 'Inventory', 'email' => 'expiry@example.test', 'password' => 'password', 'role' => User::ROLE_BHC, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ['inventory.view', 'inventory.manage', 'items.dispense']]);
        $this->actingAs($this->staff, 'sanctum');
    }

    public function test_availability_list_exposes_opening_expiry_groups_as_plain_fefo_stock(): void
    {
        $id = $this->postJson('/api/medicines', [
            'name' => 'Paracetamol 95',
            'quantity' => 95,
            'unit' => 'tablets',
            'expiration_date' => '2027-03-01',
        ])->assertCreated()->json('data.id');

        $assertPayload = function (array $item) use ($id): void {
            $this->assertSame($id, $item['id']);
            $this->assertSame(95, $item['quantity']);
            $this->assertSame(95, $item['stock_summary']['available']);
            $this->assertSame(95, $item['stock_summary']['recorded']);
            $this->assertCount(1, $item['expiry_groups']);
            $this->assertSame('2027-03-01', $item['expiry_groups'][0]['expiration_date']);
            $this->assertSame(95, $item['expiry_groups'][0]['available_quantity']);
            $this->assertFalse($item['expiry_groups'][0]['expiry_not_applicable']);
            $this->assertTrue(array_is_list($item['expiry_groups']));
        };

        $assertPayload($this->getJson('/api/medicines')->assertOk()->json('data.data.0'));
        $assertPayload($this->getJson('/api/medicines')->assertOk()->json('data.data.0'));
        $this->dispense($id, 20);
        $this->assertSame(75, Medicine::findOrFail($id)->quantity);
        $this->assertDatabaseHas('medicine_inventory_transactions', [
            'medicine_id' => $id,
            'transaction_type' => 'dispense',
            'quantity_delta' => -20,
            'discrepancy' => 0,
        ]);
    }

    public function test_medicine_requires_expiry_and_only_explicit_supply_can_use_not_applicable(): void
    {
        $this->postJson('/api/medicines', ['name' => 'Missing expiry', 'quantity' => 5])->assertUnprocessable();
        $this->postJson('/api/medicines', ['name' => 'Invalid exemption', 'quantity' => 5, 'expiry_not_applicable' => true])->assertUnprocessable();
        $id = $this->postJson('/api/medicines', ['name' => 'Gauze', 'item_type' => 'health_supply', 'quantity' => 5, 'expiry_not_applicable' => true])->assertCreated()->json('data.id');
        $this->getJson("/api/medicines/$id")->assertJsonPath('data.expiry_groups.0.expiry_not_applicable', true)->assertJsonPath('data.stock_summary.available', 5);
    }

    public function test_same_expiry_receipts_create_separate_batches_and_keep_transactions(): void
    {
        $medicine = Medicine::create(['name' => 'Old', 'quantity' => 7, 'barangay_health_center_id' => $this->staff->barangay_health_center_id]);
        foreach ([4, 6] as $quantity) {
            $this->postJson("/api/medicines/$medicine->id/restock", ['quantity' => $quantity, 'expiration_date' => '2027-01-01', 'reason' => 'Received', 'idempotency_key' => (string) Str::uuid()])->assertOk();
        }
        $this->getJson("/api/medicines/$medicine->id")->assertJsonCount(2, 'data.expiry_groups')->assertJsonPath('data.stock_summary.recorded', 17)->assertJsonPath('data.stock_summary.available', 10)->assertJsonPath('data.stock_summary.unassigned', 7);
        $this->assertDatabaseCount('medicine_inventory_transactions', 2);
        $this->assertDatabaseCount('medicine_inventory_allocations', 2);
        $this->assertDatabaseHas('medicine_expiry_groups', ['medicine_id' => $medicine->id, 'is_legacy_batch' => false, 'available_quantity' => 4]);
        $this->assertDatabaseHas('medicine_expiry_groups', ['medicine_id' => $medicine->id, 'is_legacy_batch' => false, 'available_quantity' => 6]);
    }

    public function test_verified_lot_can_explicitly_restock_existing_batch_but_never_merges_silently(): void
    {
        $id = $this->createMedicine(5);
        $batch = $this->getJson("/api/medicines/$id")->json('data.expiry_groups.0');
        $this->postJson("/api/medicines/$id/restock", [
            'quantity' => 3,
            'expiration_date' => '2027-01-01',
            'manufacturer_lot_number' => 'LOT-A',
            'reason' => 'New receipt',
            'idempotency_key' => (string) Str::uuid(),
        ])->assertOk();
        $groups = $this->getJson("/api/medicines/$id")->json('data.expiry_groups');
        $this->assertCount(2, $groups);
        $lotBatch = collect($groups)->firstWhere('manufacturer_lot_number', 'LOT-A');
        $this->postJson("/api/medicines/$id/restock", [
            'quantity' => 2,
            'expiration_date' => '2027-01-01',
            'manufacturer_lot_number' => 'LOT-A',
            'restock_expiry_group_id' => $lotBatch['id'],
            'reason' => 'Add to verified lot',
            'idempotency_key' => (string) Str::uuid(),
        ])->assertOk();
        $this->getJson("/api/medicines/$id")->assertJsonCount(2, 'data.expiry_groups')
            ->assertJsonPath('data.expiry_groups.1.available_quantity', 5);
        $this->postJson("/api/medicines/$id/restock", [
            'quantity' => 1,
            'expiration_date' => '2027-01-01',
            'manufacturer_lot_number' => 'LOT-A',
            'restock_expiry_group_id' => $batch['id'],
            'reason' => 'Reject legacy target',
            'idempotency_key' => (string) Str::uuid(),
        ])->assertUnprocessable();
    }

    public function test_equal_expiry_fefo_uses_batch_id_tie_break(): void
    {
        $id = $this->createMedicine(3);
        $this->postJson("/api/medicines/$id/restock", ['quantity' => 4, 'expiration_date' => '2027-01-01', 'reason' => 'Second batch'])->assertOk();
        $groups = collect($this->getJson("/api/medicines/$id")->json('data.expiry_groups'))->sortBy('id')->values();
        $this->dispense($id, 5);
        $this->assertDatabaseHas('medicine_expiry_groups', ['id' => $groups[0]['id'], 'available_quantity' => 0]);
        $this->assertDatabaseHas('medicine_expiry_groups', ['id' => $groups[1]['id'], 'available_quantity' => 2]);
    }

    public function test_duplicate_catalog_create_is_blocked_including_archived_items(): void
    {
        $id = $this->postJson('/api/medicines', [
            'name' => 'Tracked Catalog',
            'quantity' => 2,
            'expiration_date' => '2027-01-01',
            'unit' => 'pcs',
        ])->assertCreated()->json('data.id');
        $this->postJson('/api/medicines', ['name' => 'Tracked Catalog', 'quantity' => 1, 'expiration_date' => '2027-01-01', 'unit' => 'pcs'])
            ->assertConflict()
            ->assertJsonPath('code', 'MEDICINE_DUPLICATE_CATALOG')
            ->assertJsonPath('data.id', $id);
        $this->deleteJson("/api/medicines/$id")->assertOk();
        $this->postJson('/api/medicines', ['name' => '  TRACKED CATALOG  ', 'quantity' => 1, 'expiration_date' => '2027-01-01', 'unit' => 'pcs'])
            ->assertConflict()
            ->assertJsonPath('data.is_active', false);
    }

    public function test_partial_quarantine_release_disposal_and_expired_release_safeguards(): void
    {
        $id = $this->createMedicine(10);
        $group = $this->getJson("/api/medicines/$id")->json('data.expiry_groups.0.id');
        $this->groupAction($id, $group, 'quarantine', 6)->assertOk();
        $this->groupAction($id, $group, 'release', 2)->assertOk();
        $this->groupAction($id, $group, 'quarantine_disposal', 1)->assertOk();
        $this->getJson("/api/medicines/$id")->assertJsonPath('data.stock_summary.recorded', 9)->assertJsonPath('data.stock_summary.available', 6)->assertJsonPath('data.stock_summary.quarantined', 3);
        $this->groupAction($id, $group, 'quarantine_disposal', 4)->assertConflict();
        $this->travelTo(now()->setDate(2027, 1, 2));
        $this->groupAction($id, $group, 'release', 1)->assertUnprocessable();
        $this->groupAction($id, $group, 'quarantine_disposal', 2)->assertOk();
    }

    public function test_fefo_rejects_shortage_then_allocates_only_eligible_stock(): void
    {
        $id = $this->createMedicine(5, '2026-10-28');
        $early = $this->getJson("/api/medicines/$id")->json('data.expiry_groups.0.id');
        $this->postJson("/api/medicines/$id/restock", ['quantity' => 4, 'expiration_date' => '2027-01-01', 'reason' => 'Received'])->assertOk();
        $this->groupAction($id, $early, 'quarantine', 2)->assertOk();
        $this->rejectDispense($id, 9);
        $this->assertSame(9, Medicine::findOrFail($id)->quantity);
        $this->dispense($id, 7);
        $this->getJson("/api/medicines/$id")->assertJsonPath('data.quantity', 2)->assertJsonPath('data.reconciliation_required', false)->assertJsonPath('data.stock_summary.quarantined', 2);
        $tx = DB::table('medicine_inventory_transactions')->where('transaction_type', 'dispense')->first();
        $this->assertSame(0, $tx->discrepancy);
        $this->assertSame(-7, $tx->quantity_delta);
        $this->assertSame([-3, -4], DB::table('medicine_inventory_allocations')->where('transaction_id', $tx->id)->orderBy('id')->pluck('available_delta')->all());
        $this->assertNull(\App\Models\HealthRecordMedicine::latest('id')->first()->override_reason, 'Automatic shortage must not be mislabeled as a manual override.');
    }

    public function test_group_corrections_keep_reconciliation_until_complete_current_snapshot_verified(): void
    {
        $id = $this->createMedicine(5);
        // Preserve reconciliation flags from historical shortage transactions.
        $this->dispense($id, 5);
        Medicine::whereKey($id)->update(['reconciliation_required' => true]);
        $details = $this->getJson("/api/medicines/$id")->json('data');
        $group = $details['expiry_groups'][0]['id'];
        $this->patchJson("/api/medicines/$id", ['quantity' => 10, 'reason' => 'Aggregate unsafe'])->assertUnprocessable();
        $this->postJson("/api/medicines/$id/adjust", ['action' => 'correction', 'direction' => 'in', 'quantity' => 1, 'expiry_group_id' => $group, 'pool' => 'available', 'reason' => 'Partial count'])->assertOk()->assertJsonPath('data.medicine.reconciliation_required', true);
        $payload = ['groups' => [['id' => $group, 'available_quantity' => 1, 'quarantined_quantity' => 0]], 'unassigned_quantity' => 0, 'snapshot' => $details['stock_summary']['snapshot'], 'reason' => 'Full physical verification', 'idempotency_key' => (string) Str::uuid()];
        $this->postJson("/api/medicines/$id/verify-stock", $payload)->assertConflict();
        $payload['snapshot'] = $this->getJson("/api/medicines/$id")->json('data.stock_summary.snapshot');
        $this->postJson("/api/medicines/$id/verify-stock", $payload)->assertOk()->assertJsonPath('data.medicine.reconciliation_required', false);
        $this->postJson("/api/medicines/$id/verify-stock", $payload)->assertConflict();
    }

    private function createMedicine(int $quantity, string $expiry = '2027-01-01'): int
    {
        return $this->postJson('/api/medicines', [
            'name' => 'Tracked '.Str::uuid(),
            'quantity' => $quantity,
            'expiration_date' => $expiry,
        ])->assertCreated()->json('data.id');
    }

    public function test_matching_fefo_allocations_do_not_require_a_reason(): void
    {
        $id = $this->createMedicine(5, '2026-11-01');
        $this->postJson("/api/medicines/$id/restock", ['quantity' => 4, 'expiration_date' => '2027-01-01', 'reason' => 'Received'])->assertOk();
        $groups = $this->getJson("/api/medicines/$id")->json('data.expiry_groups');
        $this->dispense($id, 6, ['allocations' => [
            ['expiry_group_id' => $groups[1]['id'], 'quantity' => 1],
            ['expiry_group_id' => $groups[0]['id'], 'quantity' => 5],
        ]]);
        $this->assertSame(3, Medicine::findOrFail($id)->quantity);
        $this->assertDatabaseHas('medicine_expiry_groups', ['id' => $groups[0]['id'], 'available_quantity' => 0]);
        $this->assertDatabaseHas('medicine_expiry_groups', ['id' => $groups[1]['id'], 'available_quantity' => 3]);
        $tx = DB::table('medicine_inventory_transactions')->where('medicine_id', $id)->where('transaction_type', 'dispense')->first();
        $this->assertSame(0, (int) $tx->discrepancy);
        $this->assertNull($tx->reason);
    }

    public function test_allocations_that_differ_from_fefo_still_require_a_reason(): void
    {
        $id = $this->createMedicine(5, '2026-11-01');
        $this->postJson("/api/medicines/$id/restock", ['quantity' => 4, 'expiration_date' => '2027-01-01', 'reason' => 'Received'])->assertOk();
        $groups = $this->getJson("/api/medicines/$id")->json('data.expiry_groups');
        try {
            $this->dispense($id, 3, ['allocations' => [['expiry_group_id' => $groups[1]['id'], 'quantity' => 3]]]);
            $this->fail('Expected a reason when the allocation differs from FEFO.');
        } catch (HttpException $exception) {
            $this->assertSame(422, $exception->getStatusCode());
        }
        $this->assertSame(9, Medicine::findOrFail($id)->quantity);
        $this->dispense($id, 3, ['allocations' => [['expiry_group_id' => $groups[1]['id'], 'quantity' => 3]], 'override_reason' => 'Selected later expiry']);
        $this->assertSame(6, Medicine::findOrFail($id)->quantity);
        $this->assertDatabaseHas('medicine_expiry_groups', ['id' => $groups[0]['id'], 'available_quantity' => 5]);
        $this->assertDatabaseHas('medicine_expiry_groups', ['id' => $groups[1]['id'], 'available_quantity' => 1]);
    }

    public function test_manual_override_records_selected_group_and_empty_override_keeps_all_stock(): void
    {
        $id = $this->createMedicine(3, '2026-11-01');
        $this->postJson("/api/medicines/$id/restock", ['quantity' => 4, 'expiration_date' => '2027-01-01', 'reason' => 'Received'])->assertOk();
        $groups = $this->getJson("/api/medicines/$id")->json('data.expiry_groups');
        $this->dispense($id, 2, ['allocations' => [['expiry_group_id' => $groups[1]['id'], 'quantity' => 2]], 'override_reason' => 'Actual package selected']);
        $this->assertDatabaseHas('medicine_expiry_groups', ['id' => $groups[0]['id'], 'available_quantity' => 3]);
        $this->assertDatabaseHas('medicine_expiry_groups', ['id' => $groups[1]['id'], 'available_quantity' => 2]);
        $this->rejectDispense($id, 2, ['allocations' => [], 'override_reason' => 'Actual given, no verified group'], 422);
        $this->assertSame(5, Medicine::findOrFail($id)->quantity);
        $history = HealthRecordMedicine::latest('id')->first()->toArray();
        $this->assertCount(1, $history['allocations']);
        $this->assertSame(0, $history['unallocated_shortage']);
    }

    public function test_expired_and_unassigned_balances_are_not_consumed_when_no_group_is_eligible(): void
    {
        $id = $this->createMedicine(3, '2026-10-28');
        Medicine::whereKey($id)->update(['quantity' => 8]); // Explicit preexisting residual scenario.
        $this->travelTo(now()->setDate(2026, 10, 29));
        $this->rejectDispense($id, 4);
        $this->getJson("/api/medicines/$id")->assertJsonPath('data.stock_summary.recorded', 8)->assertJsonPath('data.stock_summary.expired', 3)->assertJsonPath('data.stock_summary.unassigned', 5)->assertJsonPath('data.stock_summary.available', 0);
        $this->assertDatabaseMissing('medicine_inventory_transactions', ['medicine_id' => $id, 'transaction_type' => 'dispense']);
    }

    public function test_group_action_permissions_facility_ownership_and_idempotency(): void
    {
        $id = $this->createMedicine(5);
        $group = $this->getJson("/api/medicines/$id")->json('data.expiry_groups.0.id');
        $other = $this->createMedicine(2);
        $this->groupAction($other, $group, 'quarantine', 1)->assertUnprocessable();
        $key = (string) Str::uuid();
        $payload = ['action' => 'quarantine', 'expiry_group_id' => $group, 'quantity' => 1, 'reason' => 'Seal damaged', 'idempotency_key' => $key];
        $this->postJson("/api/medicines/$id/group-action", $payload)->assertOk();
        $this->postJson("/api/medicines/$id/group-action", $payload)->assertConflict();
        $this->staff->update(['permissions' => ['inventory.view']]);
        $this->groupAction($id, $group, 'release', 1)->assertForbidden();
        $this->staff->update(['permissions' => ['inventory.view', 'inventory.manage'], 'barangay_health_center_id' => BarangayHealthCenter::create(['name' => 'Other BHC', 'rural_health_unit_id' => $this->staff->barangayHealthCenter->rural_health_unit_id])->id]);
        $this->getJson("/api/medicines/$id")->assertForbidden();
        $this->groupAction($id, $group, 'release', 1)->assertForbidden();
    }

    public function test_rhu_inventory_uses_same_group_workflow_and_does_not_leak_to_bhc(): void
    {
        $bhcUser = $this->staff;
        $rhu = User::create(['name' => 'RHU Staff', 'email' => 'rhu-expiry@example.test', 'password' => 'password', 'role' => User::ROLE_RHU, 'status' => User::STATUS_ACTIVE, 'rural_health_unit_id' => RuralHealthUnit::first()->id, 'permissions' => ['inventory.view', 'inventory.manage']]);
        $this->actingAs($rhu, 'sanctum');
        $id = $this->createMedicine(6);
        $group = $this->getJson("/api/medicines/$id")->json('data.expiry_groups.0.id');
        $this->groupAction($id, $group, 'quarantine', 3)->assertOk();
        $this->postJson("/api/medicines/$id/deduct", ['expiry_group_id' => $group, 'quantity' => 2, 'reason' => 'Damaged package'])->assertOk()->assertJsonPath('data.medicine.quantity', 4);
        $this->actingAs($bhcUser, 'sanctum')->getJson('/api/medicines')->assertJsonCount(0, 'data.data');
    }

    public function test_dispense_normalization_preserves_sorted_allocations_and_rejects_ambiguous_duplicates(): void
    {
        $service = app(MedicineStockService::class);
        $item = ['medicine_id' => 1, 'quantity' => 5, 'allocations' => [['expiry_group_id' => 4, 'quantity' => 1], ['expiry_group_id' => 2, 'quantity' => 2]], 'override_reason' => 'Actual groups'];
        $hash = app(HealthRecordIdempotencyService::class);
        $first = $hash->hash(['dispensed_medicines' => [$item]]);
        $item['allocations'] = array_reverse($item['allocations']);
        $this->assertSame($first, $hash->hash(['dispensed_medicines' => [$item]]));
        $item['allocations'][0]['quantity'] = 1;
        $this->assertNotSame($first, $hash->hash(['dispensed_medicines' => [$item]]));
        $this->expectException(HttpException::class);
        $service->normalize([$item, ['medicine_id' => 1, 'quantity' => 1]]);
    }

    public function test_manual_overdraw_rolls_back_and_does_not_substitute_other_groups(): void
    {
        $id = $this->createMedicine(2);
        $group = $this->getJson("/api/medicines/$id")->json('data.expiry_groups.0.id');
        $this->groupAction($id, $group, 'quarantine', 1)->assertOk();
        try {
            $this->dispense($id, 2, ['allocations' => [['expiry_group_id' => $group, 'quantity' => 2]], 'override_reason' => 'Actual group']);
            $this->fail('Expected stale allocation conflict.');
        } catch (HttpResponseException $e) {
            $this->assertSame(409, $e->getResponse()->getStatusCode());
        }
        $this->assertSame(2, Medicine::findOrFail($id)->quantity);
        $this->assertDatabaseMissing('medicine_inventory_transactions', ['medicine_id' => $id, 'transaction_type' => 'dispense']);
    }

    public function test_complete_verification_and_unassigned_correction_preserve_all_pool_totals(): void
    {
        $id = $this->createMedicine(3);
        Medicine::whereKey($id)->update(['quantity' => 8, 'reconciliation_required' => true]);
        $this->postJson("/api/medicines/$id/adjust", ['action' => 'correction', 'direction' => 'out', 'target' => 'unassigned', 'quantity' => 2, 'reason' => 'Counted residual'])->assertOk()->assertJsonPath('data.medicine.reconciliation_required', true);
        $details = $this->getJson("/api/medicines/$id")->json('data');
        $this->postJson("/api/medicines/$id/verify-stock", ['groups' => [['id' => $details['expiry_groups'][0]['id'], 'available_quantity' => 4, 'quarantined_quantity' => 2]], 'unassigned_quantity' => 1, 'snapshot' => $details['stock_summary']['snapshot'], 'reason' => 'Verified every physical pool', 'idempotency_key' => (string) Str::uuid()])->assertOk()->assertJsonPath('data.medicine.quantity', 7)->assertJsonPath('data.medicine.reconciliation_required', false);
        $this->assertDatabaseHas('medicine_inventory_transactions', ['medicine_id' => $id, 'transaction_type' => 'physical_count', 'quantity_delta' => 1]);
    }

    public function test_deduct_conflict_keeps_existing_safe_error_contract(): void
    {
        $id = $this->createMedicine(2);
        $group = $this->getJson("/api/medicines/$id")->json('data.expiry_groups.0.id');
        $this->postJson("/api/medicines/$id/deduct", ['expiry_group_id' => $group, 'quantity' => 3, 'reason' => 'Count changed'])->assertConflict()->assertJsonPath('code', 'INVENTORY_CONFLICT');
    }

    public function test_group_correction_requires_explicit_pool_and_cannot_clear_reconciliation(): void
    {
        $id = $this->createMedicine(2);
        $group = $this->getJson("/api/medicines/$id")->json('data.expiry_groups.0.id');
        $this->postJson("/api/medicines/$id/adjust", ['action' => 'correction', 'expiry_group_id' => $group, 'quantity' => 1, 'direction' => 'in', 'reason' => 'Ambiguous count'])->assertUnprocessable();
        $this->assertSame(2, Medicine::findOrFail($id)->quantity);
    }

    private function rejectDispense(int $id, int $quantity, array $extra = [], int $status = 409): void
    {
        $transactions = DB::table('medicine_inventory_transactions')->count();
        $history = HealthRecordMedicine::count();
        try {
            $this->dispense($id, $quantity, $extra);
            $this->fail('Invalid dispensing succeeded.');
        } catch (HttpResponseException $exception) {
            $this->assertSame($status, $exception->getResponse()->getStatusCode());
        }
        $this->assertDatabaseCount('medicine_inventory_transactions', $transactions);
        $this->assertDatabaseCount('health_record_medicines', $history);
    }

    public function test_api_rejects_invalid_quantities_without_mutating_stock_and_exact_stock_succeeds(): void
    {
        $id = $this->createMedicine(10);
        Medicine::whereKey($id)->update(['unit' => 'tablets']);
        $patient = Patient::create(['first_name' => 'Stock', 'last_name' => 'Patient', 'sex' => 'Male', 'barangay_health_center_id' => $this->staff->barangay_health_center_id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'barangay_health_center_id' => $this->staff->barangay_health_center_id, 'created_by' => $this->staff->id, 'category' => 'General']);
        foreach ([0, -1, 1.5, 11, 15] as $quantity) {
            $response = $this->postJson("/api/health-records/$record->id/dispensed-medicines", ['dispensed_medicines' => [['medicine_id' => $id, 'quantity' => $quantity]]]);
            $response->assertStatus($quantity > 10 ? 409 : 422);
            if ($quantity > 10) $response->assertJsonPath('message', 'Insufficient stock. Only 10 tablets are available. Please enter a quantity within the available stock.');
            $this->assertSame(10, Medicine::findOrFail($id)->quantity);
            $this->assertDatabaseCount('health_record_medicines', 0);
            $this->assertDatabaseCount('medicine_inventory_transactions', 1);
        }
        $this->postJson("/api/health-records/$record->id/dispensed-medicines", ['dispensed_medicines' => [['medicine_id' => $id, 'quantity' => 10, 'unit' => 'boxes']]])->assertOk();
        $this->assertSame(0, Medicine::findOrFail($id)->quantity);
        $this->assertSame('Unavailable', Medicine::findOrFail($id)->availability_status);
        $this->assertDatabaseHas('health_record_medicines', ['medicine_id' => $id, 'quantity' => 10, 'unit' => 'tablets']);
        $this->rejectDispense($id, 1);
    }

    public function test_standard_options_save_for_both_facilities_and_legacy_metadata_is_preserved(): void
    {
        $bhc = $this->staff;
        $rhu = User::create(['name' => 'RHU Catalog', 'email' => 'catalog@example.test', 'password' => 'password', 'role' => User::ROLE_RHU, 'status' => User::STATUS_ACTIVE, 'rural_health_unit_id' => RuralHealthUnit::first()->id, 'permissions' => ['inventory.view', 'inventory.manage']]);
        $categories = ['General Medicines', 'TB Medicines', 'Vaccines', 'Vitamins & Supplements', 'Family Planning', 'Maternal Care Supplies', 'Child Care'];
        $units = ['tablets', 'capsules', 'vials', 'bottles', 'pcs', 'sachets', 'ampoules', 'tube'];
        $types = ['medicine', 'vaccine', 'health_supply'];
        foreach ([$bhc, $rhu] as $user) {
            $this->actingAs($user, 'sanctum');
            foreach ($units as $index => $unit) {
                $data = ['name' => 'Catalog '.$index, 'quantity' => 2, 'unit' => $unit, 'category' => $categories[$index % 7], 'item_type' => $types[$index % 3], 'expiration_date' => '2027-01-01'];
                $id = $this->postJson('/api/medicines', $data)->assertCreated()->json('data.id');
                foreach (['unit', 'category', 'item_type'] as $field) $this->getJson("/api/medicines/$id")->assertJsonPath('data.'.$field, $data[$field]);
                $this->patchJson("/api/medicines/$id", ['item_type' => 'vaccine'])->assertOk()->assertJsonPath('data.item_type', 'vaccine');
                $this->patchJson("/api/medicines/$id", ['unit' => $unit === 'pcs' ? 'tablets' : 'pcs'])->assertUnprocessable();
                Medicine::whereKey($id)->update(['category' => 'Basic Medicines', 'unit' => 'boxes']);
                $this->patchJson("/api/medicines/$id", ['name' => 'Legacy '.$index, 'category' => 'Basic Medicines', 'unit' => 'boxes'])->assertOk()->assertJsonPath('data.category', 'Basic Medicines')->assertJsonPath('data.unit', 'boxes');
            }
        }
    }

    public function test_rhu_multi_item_shortage_rolls_back_and_preserves_pending_prescription(): void
    {
        $rhuId = RuralHealthUnit::first()->id;
        $rhu = User::create(['name' => 'RHU Dispenser', 'email' => 'rhu-dispense@example.test', 'password' => 'password', 'role' => User::ROLE_RHU, 'status' => User::STATUS_ACTIVE, 'rural_health_unit_id' => $rhuId, 'permissions' => ['inventory.view', 'inventory.manage', 'items.dispense']]);
        $this->actingAs($rhu, 'sanctum');
        $first = $this->createMedicine(10);
        $second = $this->createMedicine(2);
        $patient = Patient::create(['first_name' => 'RHU', 'last_name' => 'Patient', 'sex' => 'Male', 'barangay_health_center_id' => $this->staff->barangay_health_center_id]);
        $monitoring = ['consultationWorkflow' => 'rhu_itr_v1', 'prescriptionText' => 'Doctor-entered medicine, 3 tablets'];
        $record = HealthRecord::create(['patient_id' => $patient->id, 'rural_health_unit_id' => $rhuId, 'created_by' => $rhu->id, 'category' => 'General', 'monitoring_data' => $monitoring]);
        $items = [['medicine_id' => $first, 'quantity' => 7], ['medicine_id' => $second, 'quantity' => 3]];
        $this->postJson("/api/health-records/$record->id/dispensed-medicines", ['dispensed_medicines' => $items])->assertConflict()->assertJsonPath('code', 'INSUFFICIENT_STOCK');
        $this->assertSame(10, Medicine::findOrFail($first)->quantity);
        $this->assertSame(2, Medicine::findOrFail($second)->quantity);
        $this->assertDatabaseCount('health_record_medicines', 0);
        $this->assertDatabaseCount('medicine_inventory_transactions', 2);
        $this->assertSame($monitoring, $record->fresh()->monitoring_data);
        $items[1]['quantity'] = 2;
        $this->postJson("/api/health-records/$record->id/dispensed-medicines", ['dispensed_medicines' => $items])->assertOk();
        $this->assertSame(3, Medicine::findOrFail($first)->quantity);
        $this->assertSame('Low Stock', Medicine::findOrFail($first)->availability_status);
        $this->assertSame(0, Medicine::findOrFail($second)->quantity);
        $this->assertSame($monitoring, $record->fresh()->monitoring_data);
    }

    private function groupAction(int $id, int $group, string $action, int $quantity)
    {
        return $this->postJson("/api/medicines/$id/group-action", ['action' => $action, 'expiry_group_id' => $group, 'quantity' => $quantity, 'reason' => 'Verified physical disposition', 'idempotency_key' => (string) Str::uuid()]);
    }

    private function dispense(int $id, int $quantity, array $extra = []): void
    {
        $patient = Patient::create(['first_name' => 'Expiry', 'last_name' => 'Patient', 'sex' => 'Male', 'date_of_birth' => '2000-01-01', 'barangay_health_center_id' => $this->staff->barangay_health_center_id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'barangay_health_center_id' => $this->staff->barangay_health_center_id, 'created_by' => $this->staff->id, 'category' => 'General', 'date_recorded' => '2026-10-28']);
        $request = Request::create('/api/health-records', 'POST');
        $request->setUserResolver(fn () => $this->staff);
        DB::transaction(fn () => app(MedicineStockService::class)->dispense($request, $record, [['medicine_id' => $id, 'quantity' => $quantity, ...$extra]]));
    }
}
