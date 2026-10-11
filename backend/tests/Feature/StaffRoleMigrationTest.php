<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** The staff_role backfill must never change what an existing account can do. */
class StaffRoleMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function migration(): object
    {
        return require database_path('migrations/2026_10_11_000001_replace_professional_designation_with_staff_role.php');
    }

    private function legacyUser(string $email, string $role, ?string $designation, ?array $permissions, array $facility): int
    {
        return DB::table('users')->insertGetId([
            'name' => $email, 'email' => $email, 'password' => 'x', 'role' => $role, 'status' => 'active',
            'professional_designation' => $designation, 'permissions' => $permissions === null ? null : json_encode($permissions),
            'created_at' => now(), 'updated_at' => now(), ...$facility,
        ]);
    }

    public function test_backfill_keeps_existing_access_and_drops_roles_that_do_not_fit_the_tier(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Migration RHU']);
        $bhc = BarangayHealthCenter::create(['name' => 'Migration BHC']);
        $migration = $this->migration();
        $migration->down();

        $bhcNurse = $this->legacyUser('bhc-nurse@example.test', 'bhw', 'Nurse', null, ['barangay_health_center_id' => $bhc->id]);
        $bhcMidwife = $this->legacyUser('bhc-midwife@example.test', 'bhw', 'Midwife', null, ['barangay_health_center_id' => $bhc->id]);
        $rhuNurse = $this->legacyUser('rhu-nurse@example.test', 'rhu_staff', ' nurse ', ['patients.register'], ['rural_health_unit_id' => $rhu->id]);
        $logistics = $this->legacyUser('logistics@example.test', 'bhw', 'Logistics', ['inventory.view', 'inventory.manage'], ['barangay_health_center_id' => $bhc->id]);

        $migration->up();
        $row = fn (int $id) => DB::table('users')->find($id);

        $this->assertNull($row($bhcNurse)->staff_role);
        $this->assertSame(['patients.register', 'consultations.encode', 'inventory.view'], json_decode($row($bhcNurse)->permissions, true));
        // A BHC midwife with no stored duties had encoder access; the backfill must not upgrade it.
        $this->assertSame('midwife', $row($bhcMidwife)->staff_role);
        $this->assertSame(['patients.register', 'consultations.encode', 'inventory.view'], json_decode($row($bhcMidwife)->permissions, true));
        $this->assertSame('nurse', $row($rhuNurse)->staff_role);
        $this->assertSame(['patients.register'], json_decode($row($rhuNurse)->permissions, true));
        $this->assertNull($row($logistics)->staff_role);
        $this->assertSame(['inventory.view', 'inventory.manage'], json_decode($row($logistics)->permissions, true));
    }
}
