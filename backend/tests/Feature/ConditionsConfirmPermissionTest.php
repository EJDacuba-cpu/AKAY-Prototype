<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FacilityAssignment;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Services\StaffRoles;
use Tests\TestCase;

class ConditionsConfirmPermissionTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'migrations/2026_10_05_000002_grant_conditions_confirm_to_rhu_staff.php';

    public function test_rhu_preset_includes_conditions_confirm_and_clinical_does_not(): void
    {
        $this->assertContains('conditions.confirm', ActionPermissions::ALL);
        $this->assertContains('conditions.confirm', StaffRoles::defaults('nurse'));
        $this->assertNotContains('conditions.confirm', StaffRoles::defaults('midwife'));
        $this->assertNotContains('conditions.confirm', StaffRoles::defaults('encoder'));
    }

    public function test_migration_grants_it_to_users_and_assignments_holding_rhu_manage(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Perm RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Perm BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $make = fn (string $email, array $attributes) => User::create([...['name' => $email, 'email' => $email, 'password' => bcrypt('test-password'), 'status' => User::STATUS_ACTIVE], ...$attributes]);
        $rhuUser = $make('rhu@example.test', ['role' => User::ROLE_RHU, 'rural_health_unit_id' => $rhu->id, 'permissions' => ['patients.register', 'rhu.manage']]);
        $alreadyGranted = $make('done@example.test', ['role' => User::ROLE_RHU, 'rural_health_unit_id' => $rhu->id, 'permissions' => ['rhu.manage', 'conditions.confirm']]);
        $bhw = $make('bhw@example.test', ['role' => User::ROLE_BHC, 'barangay_health_center_id' => $bhc->id, 'permissions' => ['patients.register', 'consultations.encode']]);
        $legacy = $make('legacy@example.test', ['role' => User::ROLE_RHU, 'rural_health_unit_id' => $rhu->id, 'permissions' => null]);
        $granted = FacilityAssignment::create(['user_id' => $bhw->id, 'barangay_health_center_id' => $bhc->id, 'permissions' => ['rhu.manage', 'inventory.view']]);
        $other = FacilityAssignment::create(['user_id' => $bhw->id, 'rural_health_unit_id' => $rhu->id, 'permissions' => ['inventory.view']]);

        $migration = require database_path(self::MIGRATION);
        $migration->up();
        $migration->up(); // idempotent: a second run adds nothing

        $this->assertSame(['patients.register', 'rhu.manage', 'conditions.confirm'], $rhuUser->fresh()->permissions);
        $this->assertSame(['rhu.manage', 'conditions.confirm'], $alreadyGranted->fresh()->permissions);
        $this->assertNotContains('conditions.confirm', $bhw->fresh()->permissions);
        $this->assertNull($legacy->fresh()->permissions);
        $this->assertSame(['rhu.manage', 'inventory.view', 'conditions.confirm'], $granted->fresh()->permissions);
        $this->assertNotContains('conditions.confirm', $other->fresh()->permissions);

        $migration->down();

        $this->assertSame(['patients.register', 'rhu.manage'], $rhuUser->fresh()->permissions);
        $this->assertSame(['rhu.manage'], $alreadyGranted->fresh()->permissions);
        $this->assertSame(['rhu.manage', 'inventory.view'], $granted->fresh()->permissions);
    }
}
