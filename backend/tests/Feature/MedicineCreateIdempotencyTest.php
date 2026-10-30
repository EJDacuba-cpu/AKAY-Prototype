<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Medicine;
use App\Models\MedicineInventoryTransaction;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class MedicineCreateIdempotencyTest extends TestCase
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

        $this->rhu = RuralHealthUnit::create(['name' => 'Create Idempotency RHU']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Create Idempotency BHC',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->otherBhc = BarangayHealthCenter::create([
            'name' => 'Other Create Idempotency BHC',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->bhw = $this->user('Create BHW', 'create-bhw@example.test', User::ROLE_BHC, $this->bhc->id);
        $this->otherBhw = $this->user('Other Create BHW', 'other-create-bhw@example.test', User::ROLE_BHC, $this->otherBhc->id);
        $this->rhuStaff = $this->user('Create RHU', 'create-rhu@example.test', User::ROLE_RHU, null, $this->rhu->id);
    }

    public function test_repeated_identical_create_requests_replay_one_medicine_and_one_opening_balance(): void
    {
        $key = (string) Str::uuid();
        $payload = $this->createPayload('Replay Paracetamol');

        $first = $this->createMedicine($this->bhw, $payload, $key)->assertCreated();
        $second = $this->createMedicine($this->bhw, $payload, $key)
            ->assertOk()
            ->assertJsonPath('idempotent_replay', true);

        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertSame(1, Medicine::query()->where('name', 'Replay Paracetamol')->count());
        $this->assertSame(1, MedicineInventoryTransaction::query()
            ->where('medicine_id', $first->json('data.id'))
            ->where('transaction_type', 'opening_balance')
            ->count());
        $this->assertArrayNotHasKey('idempotency_key', $first->json('data'));
        $this->assertArrayNotHasKey('idempotency_hash', $first->json('data'));
    }

    public function test_concurrent_identical_create_requests_share_one_inventory_row(): void
    {
        $key = (string) Str::uuid();
        $payload = $this->createPayload('Concurrent Paracetamol');

        $responses = [
            $this->createMedicine($this->bhw, $payload, $key),
            $this->createMedicine($this->bhw, $payload, $key),
        ];

        $ids = collect($responses)
            ->each(fn ($response) => $this->assertTrue(in_array($response->status(), [200, 201], true)))
            ->map(fn ($response) => $response->json('data.id'))
            ->unique()
            ->values();

        $this->assertCount(1, $ids);
        $this->assertSame(1, Medicine::query()->where('name', 'Concurrent Paracetamol')->count());
        $this->assertSame(1, MedicineInventoryTransaction::query()
            ->where('medicine_id', $ids[0])
            ->where('transaction_type', 'opening_balance')
            ->count());
    }

    public function test_intentional_separate_creates_allow_the_same_medicine_name(): void
    {
        $payload = $this->createPayload('Shared Name Paracetamol');

        $first = $this->createMedicine($this->bhw, $payload, (string) Str::uuid())->assertCreated();
        $second = $this->createMedicine($this->bhw, $payload, (string) Str::uuid())->assertCreated();

        $this->assertNotSame($first->json('data.id'), $second->json('data.id'));
        $this->assertSame(2, Medicine::query()->where('name', 'Shared Name Paracetamol')->count());
        $this->assertSame(2, MedicineInventoryTransaction::query()
            ->where('transaction_type', 'opening_balance')
            ->count());
    }

    public function test_same_key_with_a_different_payload_is_rejected(): void
    {
        $key = (string) Str::uuid();

        $this->createMedicine($this->bhw, $this->createPayload('Original Lot'), $key)->assertCreated();
        $this->createMedicine($this->bhw, $this->createPayload('Changed Lot'), $key)
            ->assertConflict()
            ->assertJsonPath('code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');

        $this->assertSame(1, Medicine::query()->count());
        $this->assertSame(1, MedicineInventoryTransaction::query()->count());
    }

    public function test_create_keys_are_isolated_across_facilities(): void
    {
        $key = (string) Str::uuid();
        $payload = $this->createPayload('Facility Isolated Lot');

        $created = $this->createMedicine($this->bhw, $payload, $key)->assertCreated();
        $this->createMedicine($this->otherBhw, $payload, $key)
            ->assertConflict()
            ->assertJsonPath('code', 'IDEMPOTENCY_KEY_UNAVAILABLE');

        $this->assertSame(1, Medicine::query()->count());
        $this->assertSame($this->bhc->id, Medicine::find($created->json('data.id'))->barangay_health_center_id);
        $this->assertDatabaseMissing('medicines', [
            'name' => 'Facility Isolated Lot',
            'barangay_health_center_id' => $this->otherBhc->id,
        ]);
    }

    public function test_rhu_create_without_a_key_is_unchanged(): void
    {
        $this->actingAs($this->rhuStaff, 'sanctum')
            ->postJson('/api/medicines', $this->createPayload('RHU Unkeyed Lot'))
            ->assertCreated()
            ->assertJsonPath('data.name', 'RHU Unkeyed Lot');

        $medicine = Medicine::query()->where('name', 'RHU Unkeyed Lot')->firstOrFail();
        $this->assertSame($this->rhu->id, $medicine->rural_health_unit_id);
        $this->assertNull($medicine->barangay_health_center_id);
        $this->assertSame(8, $medicine->quantity);
        $this->assertSame(1, $medicine->inventoryTransactions()->count());
    }

    public function test_failed_create_does_not_leave_an_opening_balance(): void
    {
        $this->actingAs($this->bhw, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/medicines', [
                'name' => 'Rejected Lot',
                'quantity' => -4,
            ])
            ->assertUnprocessable();

        $this->assertDatabaseMissing('medicines', ['name' => 'Rejected Lot']);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
    }

    public function test_failed_delete_preserves_inventory_and_history(): void
    {
        $created = $this->createMedicine(
            $this->bhw,
            $this->createPayload('Protected Delete Lot'),
            (string) Str::uuid()
        )->assertCreated();
        $medicineId = $created->json('data.id');

        $this->actingAs($this->otherBhw, 'sanctum')
            ->deleteJson("/api/medicines/{$medicineId}")
            ->assertForbidden();

        $this->assertTrue(Medicine::find($medicineId)->is_active);
        $this->assertSame(1, MedicineInventoryTransaction::query()
            ->where('medicine_id', $medicineId)
            ->count());
    }

    public function test_used_inventory_is_not_cascade_deleted(): void
    {
        $key = (string) Str::uuid();
        $created = $this->createMedicine($this->bhw, $this->createPayload('Kept History Lot'), $key)
            ->assertCreated();
        $medicineId = $created->json('data.id');

        $this->actingAs($this->bhw, 'sanctum')
            ->deleteJson("/api/medicines/{$medicineId}")
            ->assertOk();

        $this->assertFalse(Medicine::find($medicineId)->is_active);
        $this->assertSame(1, MedicineInventoryTransaction::query()
            ->where('medicine_id', $medicineId)
            ->count());
    }

    private function createMedicine(User $user, array $payload, string $key)
    {
        return $this->actingAs($user, 'sanctum')
            ->withHeader('Idempotency-Key', $key)
            ->postJson('/api/medicines', $payload);
    }

    private function createPayload(string $name): array
    {
        return [
            'name' => $name,
            'category' => 'Basic Medicines',
            'quantity' => 8,
            'unit' => 'tablets',
            'low_stock_threshold' => 3,
            'expiration_date' => now()->addYear()->toDateString(),
        ];
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
            'permissions' => ['inventory.view', 'inventory.manage'],
        ]);
    }
}
