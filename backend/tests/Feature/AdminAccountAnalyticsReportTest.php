<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminAccountAnalyticsReportTest extends TestCase
{
    use RefreshDatabase;

    private function actingAdmin(): User
    {
        $admin = User::create([
            'name' => 'MHO',
            'email' => 'mho-report@example.test',
            'password' => 'password123',
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
            'permissions' => [],
        ]);
        Sanctum::actingAs($admin, ['*']);

        return $admin;
    }

    private function staff(string $role, string $status): User
    {
        static $n = 0;
        $n++;

        return User::create([
            'name' => "Staff {$n}",
            'email' => "staff{$n}@example.test",
            'password' => 'password123',
            'role' => $role,
            'staff_role' => $role === User::ROLE_ADMIN ? null : 'midwife',
            'status' => $status,
            'permissions' => [],
        ]);
    }

    public function test_admin_report_returns_reconciled_account_analytics_matrix(): void
    {
        $this->actingAdmin(); // 1 admin active
        $this->staff(User::ROLE_BHC, User::STATUS_ACTIVE);
        $this->staff(User::ROLE_RHU, User::STATUS_ACTIVE);
        $this->staff(User::ROLE_RHU, User::STATUS_INACTIVE);

        $response = $this->getJson('/api/reports/admin')->assertOk();
        $analytics = $response->json('data.account_analytics');

        $this->assertSame(['admin', 'bhc', 'rhu'], $analytics['roles']);
        $this->assertSame(['active', 'inactive'], $analytics['statuses']);
        $this->assertSame(1, $analytics['matrix']['admin']['active']);
        $this->assertSame(0, $analytics['matrix']['admin']['inactive']);
        $this->assertSame(1, $analytics['matrix']['bhc']['active']);
        $this->assertSame(0, $analytics['matrix']['bhc']['inactive']);
        $this->assertSame(1, $analytics['matrix']['rhu']['active']);
        $this->assertSame(1, $analytics['matrix']['rhu']['inactive']);

        $totals = $analytics['totals'];
        $this->assertSame(4, $totals['accounts']);
        $this->assertSame(3, $totals['active']);
        $this->assertSame(1, $totals['inactive']);
        $this->assertSame(4, $totals['canonical_accounts']);
        $this->assertSame(0, $analytics['other_accounts']);
        $this->assertSame(4, $totals['active'] + $totals['inactive']);
        $this->assertSame($totals['accounts'], $totals['canonical_accounts'] + $analytics['other_accounts']);
        $this->assertSame(
            $totals['accounts'],
            $this->sumMatrixCells($analytics['matrix']) + $analytics['other_accounts']
        );
        $this->assertSame(1, $totals['by_role']['admin']);
        $this->assertSame(1, $totals['by_role']['bhc']);
        $this->assertSame(2, $totals['by_role']['rhu']);

        // Legacy fields still present
        $this->assertArrayHasKey('users_by_role', $response->json('data'));
        $this->assertArrayHasKey('users_by_status', $response->json('data'));
    }

    public function test_other_accounts_are_counted_not_charted(): void
    {
        $this->actingAdmin();
        \DB::table('users')->insert([
            'name' => 'Legacy',
            'email' => 'legacy@example.test',
            'password' => bcrypt('password123'),
            'role' => 'municipal', // non-canonical
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $analytics = $this->getJson('/api/reports/admin')->assertOk()->json('data.account_analytics');
        $this->assertSame(1, $analytics['other_accounts']);
        $this->assertSame(2, $analytics['totals']['accounts']);
        $this->assertSame(1, $analytics['totals']['canonical_accounts']);
        $this->assertSame(
            $analytics['totals']['accounts'],
            $analytics['totals']['canonical_accounts'] + $analytics['other_accounts']
        );
        $this->assertSame(
            $analytics['totals']['accounts'],
            $this->sumMatrixCells($analytics['matrix']) + $analytics['other_accounts']
        );
        $this->assertSame(0, $analytics['matrix']['admin']['inactive']);
        $this->assertSame(1, $analytics['matrix']['admin']['active']);
    }

    public function test_canonical_role_with_noncanonical_status_counts_as_other(): void
    {
        $this->actingAdmin();
        \DB::table('users')->insert([
            'name' => 'Odd Status',
            'email' => 'odd-status@example.test',
            'password' => bcrypt('password123'),
            'role' => User::ROLE_BHC,
            'status' => 'suspended', // non-canonical status
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $analytics = $this->getJson('/api/reports/admin')->assertOk()->json('data.account_analytics');

        $this->assertSame(1, $analytics['other_accounts']);
        $this->assertSame(2, $analytics['totals']['accounts']);
        $this->assertSame(1, $analytics['totals']['canonical_accounts']);
        $this->assertSame(0, $analytics['matrix']['bhc']['active']);
        $this->assertSame(0, $analytics['matrix']['bhc']['inactive']);
        $this->assertSame(0, $analytics['totals']['by_role']['bhc']);
        $this->assertSame(
            $analytics['totals']['accounts'],
            $analytics['totals']['canonical_accounts'] + $analytics['other_accounts']
        );
        $this->assertSame(
            $analytics['totals']['accounts'],
            $this->sumMatrixCells($analytics['matrix']) + $analytics['other_accounts']
        );
    }

    private function sumMatrixCells(array $matrix): int
    {
        $sum = 0;
        foreach ($matrix as $statuses) {
            foreach ($statuses as $count) {
                $sum += (int) $count;
            }
        }

        return $sum;
    }

    public function test_non_admin_cannot_access_admin_report(): void
    {
        $bhc = User::create([
            'name' => 'BHC',
            'email' => 'bhc-report@example.test',
            'password' => 'password123',
            'role' => User::ROLE_BHC,
            'staff_role' => 'midwife',
            'status' => User::STATUS_ACTIVE,
            'permissions' => [],
        ]);
        Sanctum::actingAs($bhc, ['*']);

        $this->getJson('/api/reports/admin')->assertForbidden();
    }
}
