<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** users.role values bhw/rhu_staff become bhc/rhu; Postgres role comparisons are rewritten, nothing else. */
class AccountRoleRenameMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function migration(): object
    {
        return require database_path('migrations/2026_10_11_000002_rename_account_role_values.php');
    }

    private function user(string $email, string $role): int
    {
        return DB::table('users')->insertGetId([
            'name' => $email, 'email' => $email, 'password' => 'x', 'role' => $role, 'status' => 'active',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_role_values_are_renamed_and_restored(): void
    {
        $migration = $this->migration();
        $migration->down();
        $bhc = $this->user('bhc@example.test', 'bhw');
        $rhu = $this->user('rhu@example.test', 'rhu_staff');
        $admin = $this->user('admin2@example.test', 'admin');
        $role = fn (int $id) => DB::table('users')->where('id', $id)->value('role');

        $migration->up();
        $this->assertSame(['bhc', 'rhu', 'admin'], [$role($bhc), $role($rhu), $role($admin)]);

        $migration->down();
        $this->assertSame(['bhw', 'rhu_staff', 'admin'], [$role($bhc), $role($rhu), $role($admin)]);
    }

    public function test_rewrite_up_changes_only_role_comparisons(): void
    {
        $migration = $this->migration();
        $sql = "WHERE (p_role = 'bhw' AND x) OR (p_role='rhu_staff') AND u.role = 'bhw' AND u.role  =  'rhu_staff' AND ROLE='bhw'"
            ." AND u.staff_role = 'bhw' AND staff_role='bhw' AND p_facility_type = 'bhc' AND facility_type = 'rhu'";

        $this->assertSame(
            "WHERE (p_role = 'bhc' AND x) OR (p_role='rhu') AND u.role = 'bhc' AND u.role  =  'rhu' AND ROLE='bhc'"
            ." AND u.staff_role = 'bhw' AND staff_role='bhw' AND p_facility_type = 'bhc' AND facility_type = 'rhu'",
            $migration->rewriteUp($sql)
        );
    }

    public function test_rewrite_down_mirrors_up_and_leaves_facility_types_alone(): void
    {
        $migration = $this->migration();
        $sql = "WHERE (p_role = 'bhc' AND x) OR u.role = 'rhu' AND p_facility_type = 'bhc' AND facility_type = 'rhu' AND u.staff_role = 'bhw'";

        $this->assertSame(
            "WHERE (p_role = 'bhw' AND x) OR u.role = 'rhu_staff' AND p_facility_type = 'bhc' AND facility_type = 'rhu' AND u.staff_role = 'bhw'",
            $migration->rewriteDown($sql)
        );
    }
}
