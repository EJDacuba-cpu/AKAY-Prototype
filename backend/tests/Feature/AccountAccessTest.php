<?php

namespace Tests\Feature;

use App\Models\AccountInvite;
use App\Models\BarangayHealthCenter;
use App\Models\PasswordResetRequest;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccountAccessTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();

        $rhu = RuralHealthUnit::create(['name' => 'Access RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Access BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->admin = User::create(['name' => 'MHO', 'email' => 'mho@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []]);
        Sanctum::actingAs($this->admin, ['*']);
    }

    private function makeUser(string $email = 'nurse@example.test'): User
    {
        return User::create([
            'name' => 'User '.$email, 'email' => $email, 'password' => bin2hex(random_bytes(16)),
            'role' => 'bhc', 'staff_role' => 'midwife', 'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id, 'permissions' => [],
        ]);
    }

    private function makeInvite(User $user, array $attributes = []): AccountInvite
    {
        return AccountInvite::create([
            'user_id' => $user->id, 'email' => $user->email,
            'status' => AccountInvite::STATUS_PENDING, 'delivery' => AccountInvite::DELIVERY_SENT,
            'expires_at' => now()->addHours(10), 'sent_at' => now(),
            ...$attributes,
        ]);
    }

    private function makeReset(User $user, array $attributes = []): PasswordResetRequest
    {
        return PasswordResetRequest::create([
            'user_id' => $user->id, 'email' => $user->email,
            'status' => PasswordResetRequest::STATUS_PENDING, 'requested_at' => now(),
            ...$attributes,
        ]);
    }

    public function test_admin_gets_the_invite_and_the_open_reset_request(): void
    {
        $user = $this->makeUser();
        $invite = $this->makeInvite($user);
        $this->makeReset($user, ['status' => PasswordResetRequest::STATUS_COMPLETED, 'requested_at' => now()->subDays(2)]);
        $pending = $this->makeReset($user);

        $this->getJson("/api/users/{$user->id}/access")
            ->assertOk()
            ->assertJsonPath('data.invite.id', $invite->id)
            ->assertJsonPath('data.invite.user.status', 'active')
            ->assertJsonPath('data.reset_request.id', $pending->id)
            ->assertJsonPath('data.reset_request.status', 'pending');
    }

    public function test_completed_and_declined_reset_requests_are_not_returned(): void
    {
        $user = $this->makeUser();
        $this->makeReset($user, ['status' => PasswordResetRequest::STATUS_COMPLETED]);
        $this->makeReset($user, ['status' => PasswordResetRequest::STATUS_REJECTED]);

        $this->getJson("/api/users/{$user->id}/access")
            ->assertOk()
            ->assertJsonPath('data.reset_request', null);
    }

    public function test_an_account_without_invite_or_reset_returns_nulls(): void
    {
        $user = $this->makeUser();

        $this->getJson("/api/users/{$user->id}/access")
            ->assertOk()
            ->assertExactJson(['data' => ['invite' => null, 'reset_request' => null]]);
    }

    public function test_stale_rows_are_expired_before_reading(): void
    {
        $user = $this->makeUser();
        $this->makeInvite($user, ['expires_at' => now()->subMinute()]);
        $this->makeReset($user, [
            'status' => PasswordResetRequest::STATUS_APPROVED,
            'delivery' => PasswordResetRequest::DELIVERY_SENT,
            'expires_at' => now()->subMinute(),
        ]);

        $this->getJson("/api/users/{$user->id}/access")
            ->assertOk()
            ->assertJsonPath('data.invite.status', 'expired')
            ->assertJsonPath('data.reset_request.status', 'expired');
    }

    public function test_non_admin_is_refused(): void
    {
        $user = $this->makeUser();
        Sanctum::actingAs($this->makeUser('other@example.test'), ['*']);

        $this->getJson("/api/users/{$user->id}/access")->assertForbidden();
    }

    public function test_row_shape_matches_the_lists(): void
    {
        $user = $this->makeUser();
        $this->makeInvite($user);

        $fromList = $this->getJson('/api/account-invites')->assertOk()->json('data.data.0');

        $this->getJson("/api/users/{$user->id}/access")
            ->assertOk()
            ->assertJsonPath('data.invite', $fromList);
    }
}
