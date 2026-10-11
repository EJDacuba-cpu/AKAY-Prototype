<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Duties granted beyond a role's defaults need no acknowledgement and unlock their endpoints. */
class PermissionOverrideTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Override RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Override BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $admin = User::create(['name' => 'MHO', 'email' => 'mho@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []]);
        Sanctum::actingAs($admin, ['*']);
    }

    private function encoderPayload(array $extra): array
    {
        return ['name' => 'Encoder', 'email' => 'encoder@example.test', 'contact_number' => '09171234567',
            'password' => 'password123', 'password_confirmation' => 'password123', 'role' => 'bhw', 'staff_role' => 'encoder',
            'barangay_health_center_id' => $this->bhc->id, 'permissions' => [...StaffRoles::defaults('encoder'), ...$extra],
            'permissions_confirmed' => true];
    }

    private function staff(array $permissions): User
    {
        return User::create(['name' => 'Encoder', 'email' => uniqid().'@example.test', 'password' => 'password123', 'role' => 'bhw', 'status' => 'active',
            'staff_role' => 'encoder', 'barangay_health_center_id' => $this->bhc->id, 'permissions' => $permissions]);
    }

    public function test_encoder_inventory_duty_unlocks_stock_writes(): void
    {
        $this->postJson('/api/users', $this->encoderPayload(['inventory.manage']))->assertCreated();

        Sanctum::actingAs($this->staff(StaffRoles::defaults('encoder')), ['akay:access']);
        $this->postJson('/api/medicines', [])->assertForbidden();
        // Past the action-permission middleware: only payload validation is left to fail.
        Sanctum::actingAs(User::where('email', 'encoder@example.test')->firstOrFail(), ['akay:access']);
        $this->postJson('/api/medicines', [])->assertUnprocessable();
    }

    public function test_encoder_history_duty_unlocks_health_record_reads(): void
    {
        $this->postJson('/api/users', $this->encoderPayload(['clinical.history']))->assertCreated();

        Sanctum::actingAs(User::where('email', 'encoder@example.test')->firstOrFail(), ['akay:access']);
        $this->getJson('/api/health-records')->assertOk();
    }

    public function test_licensed_acts_are_grantable_to_encoders(): void
    {
        $this->postJson('/api/users', $this->encoderPayload(['clinical.history', 'consultations.finalize']))->assertCreated();

        $this->assertTrue(ActionPermissions::allows(User::where('email', 'encoder@example.test')->firstOrFail(), 'consultations.finalize'));
    }

    public function test_duties_must_be_granted_with_their_prerequisites(): void
    {
        $this->postJson('/api/users', [...$this->encoderPayload([]), 'permissions' => ['inventory.manage']])
            ->assertUnprocessable()->assertJsonValidationErrors('permissions');
    }

    public function test_role_change_keeps_existing_duties_without_acknowledgement(): void
    {
        $midwife = $this->staff(StaffRoles::defaults('midwife'));

        $this->patchJson("/api/users/{$midwife->id}", ['staff_role' => 'encoder', 'permissions_confirmed' => true])->assertOk();
        $this->assertSame('encoder', $midwife->fresh()->staff_role);
    }

    public function test_status_only_update_needs_no_confirmation(): void
    {
        $encoder = $this->staff([...StaffRoles::defaults('encoder'), 'inventory.view', 'inventory.manage']);

        $this->patchJson("/api/users/{$encoder->id}", ['status' => 'inactive'])->assertOk();
    }
}
