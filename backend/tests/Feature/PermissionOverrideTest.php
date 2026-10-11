<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PermissionOverrideTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Override RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Override BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->admin = User::create(['name' => 'MHO', 'email' => 'mho@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []]);
        Sanctum::actingAs($this->admin, ['*']);
    }

    private function encoderPayload(array $extra, array $acknowledged = []): array
    {
        return ['name' => 'Encoder', 'email' => 'encoder@example.test', 'password' => 'password123', 'role' => 'bhw', 'professional_designation' => 'Encoder',
            'barangay_health_center_id' => $this->bhc->id, 'permissions' => [...ActionPermissions::PRESETS['encoder'], ...$extra],
            'permissions_confirmed' => true, 'acknowledged_overrides' => $acknowledged];
    }

    private function staff(string $designation, array $permissions): User
    {
        return User::create(['name' => $designation, 'email' => uniqid().'@example.test', 'password' => 'password123', 'role' => 'bhw', 'status' => 'active',
            'professional_designation' => $designation, 'barangay_health_center_id' => $this->bhc->id, 'permissions' => $permissions]);
    }

    public function test_in_scope_duties_need_no_override_acknowledgement(): void
    {
        $this->postJson('/api/users', $this->encoderPayload([]))->assertCreated();
    }

    public function test_encoder_inventory_override_needs_acknowledgement_then_unlocks_stock_writes(): void
    {
        $this->postJson('/api/users', $this->encoderPayload(['inventory.manage']))
            ->assertUnprocessable()->assertJsonValidationErrors('acknowledged_overrides');
        $this->postJson('/api/users', $this->encoderPayload(['inventory.manage'], ['inventory.manage']))->assertCreated();

        Sanctum::actingAs($this->staff('Encoder', ActionPermissions::PRESETS['encoder']), ['akay:access']);
        $this->postJson('/api/medicines', [])->assertForbidden();
        // Past the action-permission middleware: only payload validation is left to fail.
        Sanctum::actingAs(User::where('email', 'encoder@example.test')->firstOrFail(), ['akay:access']);
        $this->postJson('/api/medicines', [])->assertUnprocessable();
    }

    public function test_encoder_history_override_unlocks_health_record_reads(): void
    {
        $this->postJson('/api/users', $this->encoderPayload(['clinical.history'], ['clinical.history']))->assertCreated();

        Sanctum::actingAs(User::where('email', 'encoder@example.test')->firstOrFail(), ['akay:access']);
        $this->getJson('/api/health-records')->assertOk();
    }

    public function test_licensed_acts_are_grantable_to_encoders_as_acknowledged_critical_overrides(): void
    {
        $this->postJson('/api/users', $this->encoderPayload(['clinical.history', 'consultations.finalize'], ['clinical.history']))
            ->assertUnprocessable()->assertJsonValidationErrors('acknowledged_overrides');
        $this->postJson('/api/users', $this->encoderPayload(['clinical.history', 'consultations.finalize'], ['clinical.history', 'consultations.finalize']))
            ->assertCreated();

        $encoder = User::where('email', 'encoder@example.test')->firstOrFail();
        $this->assertTrue(ActionPermissions::allows($encoder, 'consultations.finalize'));
        $this->assertStringContainsString('consultations.finalize (CRITICAL)', AuditLog::where('action', 'created')->latest('id')->value('description'));
    }

    public function test_duties_must_be_granted_with_their_prerequisites(): void
    {
        $this->postJson('/api/users', [...$this->encoderPayload([], ['inventory.manage']), 'permissions' => ['inventory.manage']])
            ->assertUnprocessable()->assertJsonValidationErrors('permissions');
    }

    public function test_designation_change_reclassifies_existing_duties_as_overrides(): void
    {
        $midwife = $this->staff('Midwife', ActionPermissions::PRESETS['clinical']);
        $overrides = ActionPermissions::overrides(ActionPermissions::PRESETS['clinical'], 'Encoder', 'bhw');

        $this->patchJson("/api/users/{$midwife->id}", ['professional_designation' => 'Encoder', 'permissions_confirmed' => true])
            ->assertUnprocessable()->assertJsonValidationErrors('acknowledged_overrides');
        $this->patchJson("/api/users/{$midwife->id}", ['professional_designation' => 'Encoder', 'permissions_confirmed' => true, 'acknowledged_overrides' => $overrides])->assertOk();
    }

    public function test_status_only_update_does_not_ask_to_reacknowledge_overrides(): void
    {
        $encoder = $this->staff('Encoder', [...ActionPermissions::PRESETS['encoder'], 'inventory.manage']);

        // permissions_confirmed is always required by UserRequest's implicit `accepted` rule (pre-existing).
        $this->patchJson("/api/users/{$encoder->id}", ['status' => 'inactive', 'permissions_confirmed' => true])->assertOk();
    }

    public function test_override_tiers_follow_designation(): void
    {
        $this->assertSame('critical', ActionPermissions::overrideTier('consultations.finalize', 'Encoder'));
        $this->assertSame('sensitive', ActionPermissions::overrideTier('conditions.confirm', 'Midwife'));
        $this->assertSame('sensitive', ActionPermissions::overrideTier('inventory.manage', 'Encoder'));
        $this->assertSame('override', ActionPermissions::overrideTier('patients.register', 'Logistics'));
    }
}
