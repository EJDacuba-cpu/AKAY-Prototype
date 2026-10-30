<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\RhuProvider;
use App\Models\RhuProviderUnavailability;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\RhuDoctorRosterService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RhuProviderUnavailabilityTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhuA;

    private RuralHealthUnit $rhuB;

    private BarangayHealthCenter $bhcA;

    private User $rhuStaffA;

    private User $rhuStaffB;

    private User $bhwA;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.timezone' => 'Asia/Manila']);
        date_default_timezone_set('Asia/Manila');
        Carbon::setTestNow(Carbon::parse('2026-10-22 08:00:00', 'Asia/Manila'));

        $this->rhuA = RuralHealthUnit::create(['name' => 'Cal RHU A', 'status' => 'active']);
        $this->rhuB = RuralHealthUnit::create(['name' => 'Cal RHU B', 'status' => 'active']);
        $this->bhcA = BarangayHealthCenter::create([
            'name' => 'Cal BHC A',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhuA->id,
        ]);
        $this->rhuStaffA = $this->user('Cal RHU A', 'cal-rhu-a@example.test', User::ROLE_RHU, rhuId: $this->rhuA->id);
        $this->rhuStaffB = $this->user('Cal RHU B', 'cal-rhu-b@example.test', User::ROLE_RHU, rhuId: $this->rhuB->id);
        $this->bhwA = $this->user('Cal BHW', 'cal-bhw@example.test', User::ROLE_BHC, bhcId: $this->bhcA->id);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_staff_can_schedule_all_day_and_timed_absences(): void
    {
        $provider = $this->seedAvailableProvider($this->rhuA, 'Dr. Calendar');

        $allDay = $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson("/api/rhu-providers/{$provider->id}/unavailability", [
                'local_date' => '2026-10-23',
                'all_day' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.local_date', '2026-10-23')
            ->assertJsonPath('data.all_day', true)
            ->assertJsonPath('data.start_time', null)
            ->json('data.id');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson("/api/rhu-providers/{$provider->id}/unavailability", [
                'local_date' => '2026-10-24',
                'all_day' => false,
                'start_time' => '09:00',
                'end_time' => '12:00',
            ])
            ->assertCreated()
            ->assertJsonPath('data.all_day', false)
            ->assertJsonPath('data.start_time', '09:00')
            ->assertJsonPath('data.end_time', '12:00');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}/unavailability/{$allDay}", [
                'all_day' => false,
                'start_time' => '13:00',
                'end_time' => '16:00',
            ])
            ->assertOk()
            ->assertJsonPath('data.all_day', false)
            ->assertJsonPath('data.start_time', '13:00')
            ->assertJsonPath('data.end_time', '16:00');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson("/api/rhu-providers/{$provider->id}/unavailability?from=2026-10-01&to=2026-10-31")
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->deleteJson("/api/rhu-providers/{$provider->id}/unavailability/{$allDay}")
            ->assertOk();

        $this->assertTrue(AuditLog::where('action', 'provider_unavailability_created')->exists());
        $this->assertTrue(AuditLog::where('action', 'provider_unavailability_deleted')->exists());
    }

    public function test_overlapping_and_past_windows_are_rejected(): void
    {
        $provider = $this->seedAvailableProvider($this->rhuA, 'Dr. Overlap');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson("/api/rhu-providers/{$provider->id}/unavailability", [
                'local_date' => '2026-10-23',
                'all_day' => false,
                'start_time' => '09:00',
                'end_time' => '12:00',
            ])
            ->assertCreated();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson("/api/rhu-providers/{$provider->id}/unavailability", [
                'local_date' => '2026-10-23',
                'all_day' => false,
                'start_time' => '11:00',
                'end_time' => '14:00',
            ])
            ->assertUnprocessable();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson("/api/rhu-providers/{$provider->id}/unavailability", [
                'local_date' => '2026-10-21',
                'all_day' => true,
            ])
            ->assertUnprocessable();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson("/api/rhu-providers/{$provider->id}/unavailability", [
                'local_date' => '2026-10-22',
                'all_day' => false,
                'start_time' => '06:00',
                'end_time' => '07:00',
            ])
            ->assertUnprocessable();
    }

    public function test_covering_rows_and_other_rhu_or_bhw_cannot_write(): void
    {
        $official = $this->seedAvailableProvider($this->rhuA, 'Dr. Official Cal');
        $covering = RhuProvider::create([
            'rural_health_unit_id' => $this->rhuA->id,
            'name' => 'Dr. Legacy Cal',
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
            'is_active' => true,
        ]);

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson("/api/rhu-providers/{$covering->id}/unavailability", [
                'local_date' => '2026-10-23',
                'all_day' => true,
            ])
            ->assertUnprocessable()
            ->assertJsonPath('message', RhuDoctorRosterService::COVERING_LOCKED);

        $this->actingAs($this->rhuStaffB, 'sanctum')
            ->postJson("/api/rhu-providers/{$official->id}/unavailability", [
                'local_date' => '2026-10-23',
                'all_day' => true,
            ])
            ->assertForbidden();

        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson("/api/rhu-providers/{$official->id}/unavailability", [
                'local_date' => '2026-10-23',
                'all_day' => true,
            ])
            ->assertForbidden();
    }

    public function test_future_absence_does_not_change_todays_eligibility(): void
    {
        $provider = $this->seedAvailableProvider($this->rhuA, 'Dr. Future');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson("/api/rhu-providers/{$provider->id}/unavailability", [
                'local_date' => '2026-10-23',
                'all_day' => true,
            ])
            ->assertCreated();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.can_submit_referral', true)
            ->assertJsonPath('data.available_count', 1)
            ->assertJsonPath('data.providers.0.availability_status', RhuProvider::STATUS_AVAILABLE)
            ->assertJsonPath('data.providers.0.effective_availability_status', RhuProvider::STATUS_AVAILABLE);
    }

    public function test_started_absence_blocks_until_reconfirm_after_end(): void
    {
        $provider = $this->seedAvailableProvider($this->rhuA, 'Dr. Window');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson("/api/rhu-providers/{$provider->id}/unavailability", [
                'local_date' => '2026-10-22',
                'all_day' => false,
                'start_time' => '09:00',
                'end_time' => '12:00',
            ])
            ->assertCreated();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.can_submit_referral', true);

        Carbon::setTestNow(Carbon::parse('2026-10-22 10:00:00', 'Asia/Manila'));
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.can_submit_referral', false)
            ->assertJsonPath('data.providers.0.effective_availability_status', RhuProvider::STATUS_UNAVAILABLE)
            ->assertJsonPath('data.providers.0.availability_status', RhuProvider::STATUS_AVAILABLE);

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", [
                'availability_status' => RhuProvider::STATUS_AVAILABLE,
            ])
            ->assertOk();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.can_submit_referral', false);

        Carbon::setTestNow(Carbon::parse('2026-10-22 13:00:00', 'Asia/Manila'));
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.can_submit_referral', false);

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", [
                'availability_status' => RhuProvider::STATUS_AVAILABLE,
            ])
            ->assertOk();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.can_submit_referral', true)
            ->assertJsonPath('data.providers.0.effective_availability_status', RhuProvider::STATUS_AVAILABLE);
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
        ]);
    }
}
