<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\UserSessionRevocationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class AccountActivationSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected bool $autoVerifyUsers = false;

    private BarangayHealthCenter $bhc;

    private User $pending;

    protected function setUp(): void
    {
        parent::setUp();

        $rhu = RuralHealthUnit::create(['name' => 'Activation RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Activation BHC',
            'status' => 'active',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->pending = $this->staff(
            'Pending BHW',
            'pending-bhw@example.test',
            User::ROLE_BHC,
            $this->bhc->id
        );
    }

    public function test_correct_password_login_is_refused_until_the_mailbox_is_verified(): void
    {
        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->pending->email,
            'password' => 'password123',
        ]))
            ->assertForbidden()
            ->assertJsonPath('code', 'ACCOUNT_SETUP_REQUIRED');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_wrong_password_stays_generic_for_an_unverified_account(): void
    {
        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->pending->email,
            'password' => 'wrong-password',
        ]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'LOGIN_FAILED');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_an_old_access_token_cannot_read_profile_or_change_password(): void
    {
        $token = $this->pending->createToken('pre-enforcement', ['akay:access'], now()->addHours(8))->plainTextToken;
        $this->app['auth']->forgetGuards();

        $this->withToken($token)
            ->getJson('/api/auth/profile')
            ->assertForbidden()
            ->assertJsonPath('code', 'ACCOUNT_SETUP_REQUIRED');

        $this->withToken($token)
            ->postJson('/api/auth/change-password', [
                'current_password' => 'password123',
                'password' => 'PersonalPass42',
                'password_confirmation' => 'PersonalPass42',
            ])
            ->assertForbidden()
            ->assertJsonPath('code', 'ACCOUNT_SETUP_REQUIRED');

        $this->assertNull($this->pending->fresh()->email_verified_at);
        $this->assertTrue(Hash::check('password123', $this->pending->fresh()->password));
    }

    public function test_logout_still_works_for_an_unverified_account(): void
    {
        $token = $this->pending->createToken('pre-enforcement', ['akay:access'], now()->addHours(8))->plainTextToken;
        $this->app['auth']->forgetGuards();

        $this->withToken($token)
            ->postJson('/api/auth/logout')
            ->assertOk();

        $this->assertNull(PersonalAccessToken::findToken($token));
    }

    public function test_an_old_refresh_cookie_cannot_mint_a_new_session(): void
    {
        $session = app(UserSessionRevocationService::class)->issuePersistentSession($this->pending);

        $this->withCredentials()
            ->withUnencryptedCookie(
                config('auth_persistence.cookie.name'),
                $session['refresh']->plainTextToken
            )
            ->postJson('/api/auth/refresh')
            ->assertUnauthorized();

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_an_unverified_admin_is_not_exempt(): void
    {
        $admin = $this->staff('Pending MHO', 'pending-mho@example.test', User::ROLE_ADMIN);

        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $admin->email,
            'password' => 'password123',
        ]))
            ->assertForbidden()
            ->assertJsonPath('code', 'ACCOUNT_SETUP_REQUIRED');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_a_verified_account_still_obeys_active_status_and_facility_gates(): void
    {
        $verified = $this->markVerified($this->pending);

        $verified->forceFill(['status' => User::STATUS_INACTIVE])->save();
        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $verified->email,
            'password' => 'password123',
        ]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'LOGIN_FAILED');

        $verified->forceFill(['status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => null])->save();
        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $verified->email,
            'password' => 'password123',
        ]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'LOGIN_FAILED');
    }

    public function test_a_copied_invite_token_cannot_activate_after_invalidation(): void
    {
        $invite = \App\Models\AccountInvite::create([
            'user_id' => $this->pending->id,
            'email' => $this->pending->email,
            'token_hash' => hash('sha256', 'copied-token'),
            'status' => \App\Models\AccountInvite::STATUS_PENDING,
            'delivery' => \App\Models\AccountInvite::DELIVERY_COPIED,
            'expires_at' => now()->addHours(48),
            'sent_at' => now(),
        ]);

        app(\App\Services\AccountInviteService::class)->invalidateCopiedPendingInvites();

        $this->postJson('/api/auth/invites/accept', [
            'token' => 'copied-token',
            'password' => 'PersonalPass42',
            'password_confirmation' => 'PersonalPass42',
        ])->assertUnprocessable();

        $this->assertNull($this->pending->fresh()->email_verified_at);
        $this->assertNull($invite->fresh()->token_hash);
    }

    public function test_verified_login_includes_activation_timestamp_and_not_email(): void
    {
        $this->markVerified($this->pending);

        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->pending->email,
            'password' => 'password123',
        ]))
            ->assertOk()
            ->assertJsonMissingPath('user.email')
            ->assertJsonPath('user.email_verified_at', $this->pending->fresh()->email_verified_at->toJSON());
    }

    private function staff(string $name, string $email, string $role, ?int $bhcId = null): User
    {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhcId,
            'permissions' => [],
        ]);
    }
}
