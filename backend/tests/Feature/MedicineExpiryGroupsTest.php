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

    public function test_medicine_requires_expiry_and_only_explicit_supply_can_use_not_applicable(): void
    {
        $this->postJson('/api/medicines', ['name' => 'Missing expiry', 'quantity' => 5])->assertUnprocessable();
        $this->postJson('/api/medicines', ['name' => 'Invalid exemption', 'quantity' => 5, 'expiry_not_applicable' => true])->assertUnprocessable();
        $id = $this->postJson('/api/medicines', ['name' => 'Gauze', 'item_type' => 'health_supply', 'quantity' => 5, 'expiry_not_applicable' => true])->assertCreated()->json('data.id');
        $this->getJson("/api/medicines/$id")->assertJsonPath('data.expiry_groups.0.expiry_not_applicable', true)->assertJsonPath('data.stock_summary.available', 5);
    }

    public function test_same_expiry_receipts_merge_but_keep_transactions_and_residual_stock(): void
    {
        $medicine = Medicine::create(['name' => 'Old', 'quantity' => 7, 'barangay_health_center_id' => $this->staff->barangay_health_center_id]);
        foreach ([4, 6] as $quantity) {
            $this->postJson("/api/medicines/$medicine->id/restock", ['quantity' => $quantity, 'expiration_date' => '2027-01-01', 'reason' => 'Received', 'idempotency_key' => (string) Str::uuid()])->assertOk();
        }
        $this->getJson("/api/medicines/$medicine->id")->assertJsonCount(1, 'data.expiry_groups')->assertJsonPath('data.stock_summary.recorded', 17)->assertJsonPath('data.stock_summary.available', 10)->assertJsonPath('data.stock_summary.unassigned', 7);
        $this->assertDatabaseCount('medicine_inventory_transactions', 2);
        $this->assertDatabaseCount('medicine_inventory_allocations', 2);
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

    public function test_fefo_allocates_only_eligible_available_and_records_unallocated_shortage(): void
    {
        $id = $this->createMedicine(5, '2026-10-28');
        $early = $this->getJson("/api/medicines/$id")->json('data.expiry_groups.0.id');
        $this->postJson("/api/medicines/$id/restock", ['quantity' => 4, 'expiration_date' => '2027-01-01', 'reason' => 'Received'])->assertOk();
        $this->groupAction($id, $early, 'quarantine', 2)->assertOk();
        $this->dispense($id, 9);
        $this->getJson("/api/medicines/$id")->assertJsonPath('data.quantity', 2)->assertJsonPath('data.reconciliation_required', true)->assertJsonPath('data.stock_summary.quarantined', 2);
        $tx = DB::table('medicine_inventory_transactions')->where('transaction_type', 'dispense')->first();
        $this->assertSame(-2, $tx->discrepancy);
        $this->assertSame(-9, $tx->quantity_delta);
        $this->assertSame([-3, -4], DB::table('medicine_inventory_allocations')->where('transaction_id', $tx->id)->orderBy('id')->pluck('available_delta')->all());
        $this->assertNull(\App\Models\HealthRecordMedicine::latest('id')->first()->override_reason, 'Automatic shortage must not be mislabeled as a manual override.');
    }

    public function test_group_corrections_keep_reconciliation_until_complete_current_snapshot_verified(): void
    {
        $id = $this->createMedicine(5);
        $this->dispense($id, 7);
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
        return $this->postJson('/api/medicines', ['name' => 'Tracked', 'quantity' => $quantity, 'expiration_date' => $expiry])->assertCreated()->json('data.id');
    }

    public function test_manual_override_records_selected_group_and_empty_override_keeps_all_stock(): void
    {
        $id = $this->createMedicine(3, '2026-11-01');
        $this->postJson("/api/medicines/$id/restock", ['quantity' => 4, 'expiration_date' => '2027-01-01', 'reason' => 'Received'])->assertOk();
        $groups = $this->getJson("/api/medicines/$id")->json('data.expiry_groups');
        $this->dispense($id, 3, ['allocations' => [['expiry_group_id' => $groups[1]['id'], 'quantity' => 2]], 'override_reason' => 'Actual package selected']);
        $this->assertDatabaseHas('medicine_expiry_groups', ['id' => $groups[0]['id'], 'available_quantity' => 3]);
        $this->assertDatabaseHas('medicine_expiry_groups', ['id' => $groups[1]['id'], 'available_quantity' => 2]);
        $this->dispense($id, 2, ['allocations' => [], 'override_reason' => 'Actual given, no verified group']);
        $this->assertSame(5, Medicine::findOrFail($id)->quantity);
        $history = HealthRecordMedicine::latest('id')->first()->toArray();
        $this->assertSame([], $history['allocations']);
        $this->assertSame(2, $history['unallocated_shortage']);
    }

    public function test_expired_and_unassigned_balances_are_not_consumed_when_no_group_is_eligible(): void
    {
        $id = $this->createMedicine(3, '2026-10-28');
        Medicine::whereKey($id)->update(['quantity' => 8]); // Explicit preexisting residual scenario.
        $this->travelTo(now()->setDate(2026, 10, 29));
        $this->dispense($id, 4);
        $this->getJson("/api/medicines/$id")->assertJsonPath('data.stock_summary.recorded', 8)->assertJsonPath('data.stock_summary.expired', 3)->assertJsonPath('data.stock_summary.unassigned', 5)->assertJsonPath('data.stock_summary.available', 0);
        $this->assertDatabaseHas('medicine_inventory_transactions', ['medicine_id' => $id, 'transaction_type' => 'dispense', 'discrepancy' => -4]);
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
