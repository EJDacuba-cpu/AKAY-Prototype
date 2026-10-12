<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminDashboardTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::create([
            'name' => 'MHO', 'email' => 'mho@example.test', 'password' => 'password123',
            'role' => 'admin', 'status' => 'active', 'permissions' => [],
        ]);
        Sanctum::actingAs($this->admin, ['*']);
    }

    private function makeRhu(string $name, string $status = 'active'): RuralHealthUnit
    {
        return RuralHealthUnit::create(['name' => $name, 'status' => $status]);
    }

    private function makeBhc(string $name, RuralHealthUnit $rhu, string $status = 'active'): BarangayHealthCenter
    {
        return BarangayHealthCenter::create(['name' => $name, 'status' => $status, 'rural_health_unit_id' => $rhu->id]);
    }

    private function makeUser(string $role, array $attrs = []): User
    {
        $this->sequence++;

        return User::create([
            'name' => 'User '.$this->sequence, 'email' => "user{$this->sequence}@example.test",
            'password' => bin2hex(random_bytes(16)),
            'role' => $role, 'staff_role' => $role === 'admin' ? null : 'midwife', 'status' => 'active',
            'permissions' => [],
            ...$attrs,
        ]);
    }

    private function dashboard(string $query = ''): \Illuminate\Testing\TestResponse
    {
        return $this->getJson('/api/admin/dashboard'.$query);
    }

    private function stamp(\Illuminate\Testing\TestResponse $response, string $path): string
    {
        return CarbonImmutable::parse($response->json($path))->format('Y-m-d H:i');
    }

    public function test_only_admin_can_open_the_dashboard(): void
    {
        $this->dashboard()->assertOk();

        $rhu = $this->makeRhu('RHU One');
        $bhc = $this->makeBhc('BHC One', $rhu);

        Sanctum::actingAs($this->makeUser('bhc', ['barangay_health_center_id' => $bhc->id]), ['*']);
        $this->dashboard()->assertForbidden();

        Sanctum::actingAs($this->makeUser('rhu', ['rural_health_unit_id' => $rhu->id]), ['*']);
        $this->dashboard()->assertForbidden();
    }

    public function test_period_windows(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-31 15:00'));

        $month = $this->dashboard('?period=month')->assertOk()->assertJsonPath('data.period.key', 'month');
        $this->assertSame('2026-10-01 00:00', $this->stamp($month, 'data.period.from'));
        $this->assertSame('2026-10-31 15:00', $this->stamp($month, 'data.period.to'));
        $this->assertSame('2026-09-01 00:00', $this->stamp($month, 'data.period.previous_from'));
        $this->assertSame('2026-09-30 15:00', $this->stamp($month, 'data.period.previous_to'));

        $week = $this->dashboard('?period=week')->assertOk()->assertJsonPath('data.period.key', 'week');
        $this->assertSame('2026-10-26 00:00', $this->stamp($week, 'data.period.from'));
        $this->assertSame('2026-10-19 00:00', $this->stamp($week, 'data.period.previous_from'));
        $this->assertSame('2026-10-24 15:00', $this->stamp($week, 'data.period.previous_to'));

        $today = $this->dashboard('?period=today')->assertOk()->assertJsonPath('data.period.key', 'today');
        $this->assertSame('2026-10-31 00:00', $this->stamp($today, 'data.period.from'));
        $this->assertSame('2026-10-30 00:00', $this->stamp($today, 'data.period.previous_from'));
        $this->assertSame('2026-10-30 15:00', $this->stamp($today, 'data.period.previous_to'));

        $year = $this->dashboard('?period=year')->assertOk()->assertJsonPath('data.period.key', 'year');
        $this->assertSame('2026-01-01 00:00', $this->stamp($year, 'data.period.from'));
        $this->assertSame('2025-01-01 00:00', $this->stamp($year, 'data.period.previous_from'));
        $this->assertSame('2025-10-31 15:00', $this->stamp($year, 'data.period.previous_to'));
    }

    public function test_unknown_period_falls_back_to_month(): void
    {
        foreach (['?period=MONTH', '?period=%3Cscript%3E', ''] as $query) {
            $this->dashboard($query)->assertOk()->assertJsonPath('data.period.key', 'month');
        }
    }

    public function test_account_counts(): void
    {
        $rhu = $this->makeRhu('RHU One');
        $bhc = $this->makeBhc('BHC One', $rhu);

        $this->makeUser('bhc', ['barangay_health_center_id' => $bhc->id]);
        $this->makeUser('bhc', ['barangay_health_center_id' => $bhc->id]);
        $this->makeUser('bhc', ['barangay_health_center_id' => $bhc->id, 'status' => 'inactive']);
        $this->makeUser('rhu', ['rural_health_unit_id' => $rhu->id]);

        $this->dashboard()
            ->assertOk()
            ->assertJsonPath('data.accounts', ['total' => 5, 'active' => 4, 'inactive' => 1, 'bhc' => 3, 'rhu' => 1])
            ->assertJsonStructure(['data' => ['generated_at']]);
    }
}
