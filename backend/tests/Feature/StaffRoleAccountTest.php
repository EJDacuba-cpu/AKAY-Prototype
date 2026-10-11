<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StaffRoleAccountTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private RuralHealthUnit $rhu;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Role RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Role BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $admin = User::create(['name' => 'MHO', 'email' => 'mho@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []]);
        Sanctum::actingAs($admin, ['*']);
    }

    private function payload(array $overrides = []): array
    {
        return [
            'name' => 'Joshua', 'email' => 'joshua@example.test', 'contact_number' => '09171234567',
            'password' => 'password123', 'password_confirmation' => 'password123',
            'role' => 'bhw', 'staff_role' => 'encoder', 'barangay_health_center_id' => $this->bhc->id,
            'permissions' => StaffRoles::defaults('encoder'), 'permissions_confirmed' => true,
            ...$overrides,
        ];
    }

    private function rhuPayload(string $staffRole, array $overrides = []): array
    {
        return $this->payload(['role' => 'rhu_staff', 'staff_role' => $staffRole, 'barangay_health_center_id' => null,
            'rural_health_unit_id' => $this->rhu->id, 'permissions' => StaffRoles::defaults('nurse'), ...$overrides]);
    }

    private function latestAudit(): string
    {
        return (string) AuditLog::latest('id')->value('description');
    }

    public function test_creates_encoder_with_defaults(): void
    {
        $this->postJson('/api/users', $this->payload())->assertCreated();

        $this->assertDatabaseHas('users', ['email' => 'joshua@example.test', 'staff_role' => 'encoder', 'contact_number' => '09171234567']);
    }

    public function test_rejects_role_tier_mismatch(): void
    {
        $this->postJson('/api/users', $this->payload(['staff_role' => 'nurse']))->assertUnprocessable()->assertJsonValidationErrors('staff_role');
        $this->postJson('/api/users', $this->rhuPayload('midwife'))->assertUnprocessable()->assertJsonValidationErrors('staff_role');
        $this->postJson('/api/users', $this->rhuPayload('encoder'))->assertUnprocessable()->assertJsonValidationErrors('staff_role');
        $this->postJson('/api/users', $this->rhuPayload('nurse'))->assertCreated();
    }

    public function test_staff_role_required_for_staff_and_prohibited_for_admin(): void
    {
        $this->postJson('/api/users', $this->payload(['staff_role' => null]))->assertUnprocessable()->assertJsonValidationErrors('staff_role');

        $admin = $this->payload(['role' => 'admin', 'staff_role' => 'midwife', 'barangay_health_center_id' => null, 'permissions' => []]);
        $this->postJson('/api/users', $admin)->assertUnprocessable()->assertJsonValidationErrors('staff_role');
        $this->postJson('/api/users', [...$admin, 'staff_role' => null])->assertCreated();
    }

    public function test_contact_number_format(): void
    {
        foreach (['0917123456', '+639171234567', '08171234567'] as $number) {
            $this->postJson('/api/users', $this->payload(['contact_number' => $number]))->assertUnprocessable()->assertJsonValidationErrors('contact_number');
        }
        $this->postJson('/api/users', $this->payload(['contact_number' => null]))->assertUnprocessable()->assertJsonValidationErrors('contact_number');
    }

    public function test_password_confirmation_must_match(): void
    {
        $this->postJson('/api/users', $this->payload(['password_confirmation' => 'different123']))->assertUnprocessable()->assertJsonValidationErrors('password');
    }

    public function test_duty_unavailable_at_tier_rejected(): void
    {
        $this->postJson('/api/users', $this->payload(['permissions' => [...StaffRoles::defaults('encoder'), 'rhu.manage']]))
            ->assertUnprocessable()->assertJsonFragment(['rhu.manage is not available to BHC accounts.']);
        $this->postJson('/api/users', $this->rhuPayload('nurse', ['permissions' => [...StaffRoles::defaults('nurse'), 'consultations.encode']]))
            ->assertUnprocessable()->assertJsonFragment(['consultations.encode is not available to RHU accounts.']);
    }

    public function test_licensed_duty_on_encoder_needs_no_acknowledgement_and_is_audited(): void
    {
        $this->postJson('/api/users', $this->payload(['permissions' => [...StaffRoles::defaults('encoder'), 'clinical.history', 'consultations.finalize']]))->assertCreated();

        $this->assertStringContainsString('Licensed duties granted to a non-licensed role (Encoder): consultations.finalize.', $this->latestAudit());
    }

    public function test_midwife_licensed_duties_not_flagged(): void
    {
        $this->postJson('/api/users', $this->payload(['staff_role' => 'midwife', 'permissions' => StaffRoles::defaults('midwife')]))->assertCreated();

        $this->assertStringNotContainsString('Licensed duties granted', $this->latestAudit());
    }

    public function test_permissions_confirmed_required(): void
    {
        $payload = $this->payload();
        unset($payload['permissions_confirmed']);

        $this->postJson('/api/users', $payload)->assertUnprocessable()->assertJsonValidationErrors('permissions_confirmed');
    }

    public function test_status_only_patch_on_legacy_account_succeeds(): void
    {
        $legacy = User::create(['name' => 'Legacy', 'email' => 'legacy@example.test', 'password' => 'password123', 'role' => 'bhw', 'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id, 'permissions' => StaffRoles::defaults('encoder')]);

        $this->patchJson("/api/users/{$legacy->id}", ['status' => 'inactive'])->assertOk();
        $this->assertSame('inactive', $legacy->fresh()->status);
    }

    public function test_edit_without_password_keeps_password(): void
    {
        $this->postJson('/api/users', $this->payload())->assertCreated();
        $user = User::where('email', 'joshua@example.test')->firstOrFail();
        $edit = $this->payload(['name' => 'Joshua R.', 'password' => '']);
        unset($edit['password_confirmation']);

        $this->patchJson("/api/users/{$user->id}", $edit)->assertOk();

        $this->assertSame('Joshua R.', $user->fresh()->name);
        $this->assertTrue(Hash::check('password123', $user->fresh()->password));
    }

    public function test_legacy_account_must_pick_role_when_access_changes(): void
    {
        $legacy = User::create(['name' => 'Legacy', 'email' => 'legacy@example.test', 'password' => 'password123', 'role' => 'bhw', 'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id, 'permissions' => StaffRoles::defaults('encoder')]);

        $this->patchJson("/api/users/{$legacy->id}", ['permissions' => ['patients.register'], 'permissions_confirmed' => true])
            ->assertUnprocessable()->assertJsonValidationErrors('staff_role');
    }

    public function test_staff_roles_endpoint(): void
    {
        $this->getJson('/api/staff-roles')->assertOk()->assertJsonPath('data.roles.0.key', 'midwife')->assertJsonPath('data.available.rhu_staff', StaffRoles::available('rhu_staff'));

        $bhw = User::create(['name' => 'Midwife', 'email' => 'mw@example.test', 'password' => 'password123', 'role' => 'bhw', 'status' => 'active',
            'staff_role' => 'midwife', 'barangay_health_center_id' => $this->bhc->id, 'permissions' => StaffRoles::defaults('midwife')]);
        Sanctum::actingAs($bhw, ['akay:access']);
        $this->getJson('/api/staff-roles')->assertForbidden();
    }

    public function test_nurse_assignment_eligibility_uses_staff_role(): void
    {
        foreach (['nurse', 'doctor'] as $role) {
            User::create(['name' => ucfirst($role), 'email' => "{$role}@example.test", 'password' => 'password123', 'role' => 'rhu_staff', 'status' => 'active',
                'staff_role' => $role, 'rural_health_unit_id' => $this->rhu->id, 'permissions' => StaffRoles::defaults($role)]);
        }

        $emails = collect($this->getJson('/api/staff-assignments/eligible-nurses')->assertOk()->json('data'))->pluck('email')->all();

        $this->assertSame(['nurse@example.test'], $emails);
    }

    public function test_login_payload_carries_staff_role_and_contact_number(): void
    {
        $this->postJson('/api/users', $this->payload())->assertCreated();
        $user = User::where('email', 'joshua@example.test')->firstOrFail();
        Sanctum::actingAs($user, ['akay:access']);

        $this->getJson('/api/auth/profile')->assertOk()->assertJsonPath('user.staff_role', 'encoder')->assertJsonPath('user.contact_number', '09171234567');
    }
}
