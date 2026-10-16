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

class FamilyPermissionsTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;
    private RuralHealthUnit $rhu;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Home RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Home BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        Sanctum::actingAs(User::create(['name' => 'Admin', 'email' => 'admin@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active']), ['*']);
    }

    private function payload(array $permissions): array
    {
        return ['name' => 'Staff', 'email' => 'staff@example.test', 'contact_number' => '09171234567', 'role' => 'bhc', 'staff_role' => 'encoder', 'barangay_health_center_id' => $this->bhc->id, 'permissions' => $permissions, 'permissions_confirmed' => true];
    }

    public function test_admin_can_save_read_and_revoke_real_bhc_family_grants(): void
    {
        $grants = ['patients.register', 'families.view', 'families.manage'];
        $this->postJson('/api/users', $this->payload($grants))->assertCreated();
        $staff = User::where('email', 'staff@example.test')->firstOrFail();
        $this->assertSame($grants, $staff->permissions);
        $this->getJson('/api/users/'.$staff->id)->assertOk()->assertJsonPath('data.permissions', $grants);
        $this->patchJson('/api/users/'.$staff->id, ['permissions' => ['families.view'], 'permissions_confirmed' => true])->assertOk();
        $this->assertSame(['families.view'], $staff->fresh()->permissions);
        $this->assertTrue(ActionPermissions::allows($staff->fresh(), 'families.view'));
        $this->assertFalse(ActionPermissions::allows($staff->fresh(), 'families.manage'));
    }

    public function test_family_manage_requires_view_and_is_not_a_default_grant(): void
    {
        $this->assertSame(['families.manage' => ['families.view']], ActionPermissions::missingRequirements(['families.manage']));
        $this->postJson('/api/users', $this->payload(['families.manage']))->assertUnprocessable()->assertJsonValidationErrors('permissions');
        foreach (StaffRoles::ROLES as $role) {
            $this->assertNotContains('families.view', $role['defaults']);
            $this->assertNotContains('families.manage', $role['defaults']);
        }
    }

    public function test_bhc_family_duties_are_available_but_rhu_family_duties_are_not(): void
    {
        $available = $this->getJson('/api/staff-roles')->assertOk()->json('data.available');
        $this->assertContains('families.view', $available['bhc']);
        $this->assertContains('families.manage', $available['bhc']);
        $this->assertNotContains('families.view', $available['rhu']);
        $this->postJson('/api/users', [...$this->payload(['families.view']), 'role' => 'rhu', 'staff_role' => 'nurse', 'barangay_health_center_id' => null, 'rural_health_unit_id' => $this->rhu->id])->assertUnprocessable()->assertJsonValidationErrors('permissions');
    }

    public function test_profile_edit_preserves_explicit_existing_family_grants(): void
    {
        $staff = User::create([...$this->payload(['families.view']), 'password' => 'password123', 'status' => 'active']);
        $this->patchJson('/api/users/'.$staff->id, ['name' => 'Renamed Staff'])->assertOk();
        $this->assertSame(['families.view'], $staff->fresh()->permissions);
    }

    public function test_bhc_nurse_assignment_accepts_family_duties_with_prerequisites(): void
    {
        $nurse = User::create(['name' => 'Nurse', 'email' => 'nurse@example.test', 'password' => 'password123', 'role' => 'rhu', 'status' => 'active', 'staff_role' => 'nurse', 'rural_health_unit_id' => $this->rhu->id]);
        $data = ['user_id' => $nurse->id, 'barangay_health_center_id' => $this->bhc->id, 'starts_on' => today()->toDateString(), 'assignment_type' => 'ongoing'];
        $this->postJson('/api/staff-assignments', [...$data, 'permissions' => ['families.manage']])->assertUnprocessable()->assertJsonValidationErrors('permissions');
        $this->postJson('/api/staff-assignments', [...$data, 'permissions' => ['families.view', 'families.manage']])->assertCreated()->assertJsonPath('data.permissions', ['families.view', 'families.manage']);
    }
}
