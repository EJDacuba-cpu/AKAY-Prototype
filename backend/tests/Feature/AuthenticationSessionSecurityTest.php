<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\PasswordResetRequest;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class AuthenticationSessionSecurityTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhcA;

    private BarangayHealthCenter $bhcB;

    private RuralHealthUnit $rhuA;

    private RuralHealthUnit $rhuB;

    private User $admin;

    private User $bhw;

    protected function setUp(): void
    {
        parent::setUp();

        config(['sanctum.expiration' => 480]);
        RateLimiter::clear('security-bhw@example.test|127.0.0.1');

        $this->rhuA = RuralHealthUnit::create([
            'name' => 'Session RHU A',
            'status' => 'active',
        ]);
        $this->rhuB = RuralHealthUnit::create([
            'name' => 'Session RHU B',
            'status' => 'active',
        ]);
        $this->bhcA = BarangayHealthCenter::create([
            'name' => 'Session BHC A',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhuA->id,
        ]);
        $this->bhcB = BarangayHealthCenter::create([
            'name' => 'Session BHC B',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhuB->id,
        ]);
        $this->admin = $this->user(
            'Session Admin',
            'security-admin@example.test',
            User::ROLE_ADMIN
        );
        $this->bhw = $this->user(
            'Session BHW',
            'security-bhw@example.test',
            User::ROLE_BHW,
            $this->bhcA->id
        );
    }

    public function test_valid_login_issues_an_expiring_bearer_without_token_database_fields(): void
    {
        $response = $this->login($this->bhw)
            ->assertOk()
            ->assertJsonPath('token_type', 'Bearer')
            ->assertJsonPath('user.id', $this->bhw->id)
            ->assertJsonMissingPath('user.tokens')
            ->assertJsonMissingPath('user.password')
            ->assertJsonStructure(['token', 'token_type', 'expires_at', 'user']);

        $plainTextToken = $response->json('token');
        $token = PersonalAccessToken::findToken($plainTextToken);

        $this->assertNotNull($token);
        $this->assertNotNull($token->expires_at);
        $this->assertTrue($token->expires_at->isFuture());
        $this->assertSame($token->expires_at->toJSON(), $response->json('expires_at'));
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
    }

    public function test_login_failures_are_generic_for_credentials_status_role_and_facility(): void
    {
        $inactive = $this->user('Inactive', 'inactive-session@example.test', User::ROLE_ADMIN, null, null, User::STATUS_INACTIVE);
        $unassigned = $this->user('Unassigned', 'unassigned-session@example.test', User::ROLE_BHW);
        $invalidRole = $this->user('Invalid Role', 'invalid-role-session@example.test', 'legacy_role');

        $attempts = [
            ['missing-session@example.test', 'WrongPassword9'],
            [$this->bhw->email, 'WrongPassword9'],
            [$inactive->email, 'password123'],
            [$unassigned->email, 'password123'],
            [$invalidRole->email, 'password123'],
        ];

        foreach ($attempts as [$email, $password]) {
            $this->postJson('/api/auth/login', compact('email', 'password'))
                ->assertUnprocessable()
                ->assertExactJson([
                    'message' => 'The provided credentials are incorrect.',
                    'code' => 'LOGIN_FAILED',
                ]);
        }
    }

    public function test_login_is_throttled_by_normalized_email_and_ip(): void
    {
        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->postJson('/api/auth/login', [
                'email' => strtoupper($this->bhw->email),
                'password' => 'WrongPassword9',
            ])->assertUnprocessable();
        }

        $this->postJson('/api/auth/login', [
            'email' => $this->bhw->email,
            'password' => 'password123',
        ])->assertTooManyRequests()->assertExactJson([
            'message' => 'Too many login attempts. Please wait briefly and try again.',
            'code' => 'LOGIN_THROTTLED',
        ]);
    }

    public function test_logout_revokes_only_the_current_token_and_replay_fails(): void
    {
        $tokenA = $this->token($this->bhw);
        $tokenB = $this->token($this->bhw);

        $this->usingToken($tokenA)->postJson('/api/auth/logout')->assertOk();

        $this->assertNull(PersonalAccessToken::findToken($tokenA));
        $this->assertNotNull(PersonalAccessToken::findToken($tokenB));
        $this->usingToken($tokenA)->getJson('/api/auth/profile')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'SESSION_INVALID');
        $this->usingToken($tokenB)->getJson('/api/auth/profile')->assertOk();
    }

    public function test_unauthenticated_logout_is_rejected_safely(): void
    {
        $this->postJson('/api/auth/logout')->assertUnauthorized();
    }

    public function test_expired_token_is_deleted_and_rejected_across_sensitive_endpoints(): void
    {
        $expired = $this->bhw->createToken('expired', ['*'], now()->subMinute())->plainTextToken;

        $this->usingToken($expired)->getJson('/api/auth/profile')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'SESSION_EXPIRED');
        $this->assertNull(PersonalAccessToken::findToken($expired));

        foreach ([
            ['GET', '/api/patients'],
            ['POST', '/api/referrals/qr/resolve'],
        ] as [$method, $uri]) {
            $nextExpired = $this->bhw->createToken('expired', ['*'], now()->subMinute())->plainTextToken;
            $this->usingToken($nextExpired)->json($method, $uri, [])
                ->assertUnauthorized()
                ->assertJsonPath('code', 'SESSION_EXPIRED');
        }
    }

    public function test_legacy_null_expiry_tokens_use_the_global_created_at_cutoff(): void
    {
        $expired = $this->token($this->bhw);
        PersonalAccessToken::findToken($expired)->forceFill([
            'expires_at' => null,
            'created_at' => now()->subMinutes(481),
        ])->save();

        $valid = $this->token($this->bhw);
        PersonalAccessToken::findToken($valid)->forceFill([
            'expires_at' => null,
            'created_at' => now()->subMinutes(10),
        ])->save();

        $this->usingToken($expired)->getJson('/api/auth/profile')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'SESSION_EXPIRED');
        $this->usingToken($valid)->getJson('/api/auth/profile')->assertOk();
    }

    public function test_deactivation_revokes_all_tokens_and_reactivation_does_not_restore_them(): void
    {
        $oldToken = $this->token($this->bhw);
        $adminToken = $this->token($this->admin);

        $this->usingToken($adminToken)
            ->patchJson("/api/users/{$this->bhw->id}", ['status' => User::STATUS_INACTIVE])
            ->assertOk();

        $this->assertNull(PersonalAccessToken::findToken($oldToken));
        $this->usingToken($oldToken)->getJson('/api/auth/profile')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'SESSION_INVALID');

        $this->usingToken($adminToken)
            ->patchJson("/api/users/{$this->bhw->id}", ['status' => User::STATUS_ACTIVE])
            ->assertOk();

        $this->usingToken($oldToken)->getJson('/api/auth/profile')->assertUnauthorized();
        $this->login($this->bhw)->assertOk();
    }

    public function test_active_and_facility_middleware_revoke_tokens_after_out_of_band_context_changes(): void
    {
        $inactiveTokenA = $this->token($this->bhw);
        $inactiveTokenB = $this->token($this->bhw);
        $this->bhw->update(['status' => User::STATUS_INACTIVE]);

        $this->usingToken($inactiveTokenA)->getJson('/api/auth/profile')
            ->assertForbidden()
            ->assertJsonPath('code', 'ACCOUNT_INACTIVE');
        $this->assertNull(PersonalAccessToken::findToken($inactiveTokenA));
        $this->assertNull(PersonalAccessToken::findToken($inactiveTokenB));

        $this->bhw->update([
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => null,
        ]);
        $facilityTokenA = $this->token($this->bhw);
        $facilityTokenB = $this->token($this->bhw);

        $this->usingToken($facilityTokenA)->getJson('/api/patients')
            ->assertForbidden()
            ->assertJsonPath('code', 'SESSION_CONTEXT_INVALID');
        $this->assertNull(PersonalAccessToken::findToken($facilityTokenA));
        $this->assertNull(PersonalAccessToken::findToken($facilityTokenB));
    }

    public function test_invalid_role_middleware_revokes_all_tokens_with_a_stable_context_code(): void
    {
        $tokenA = $this->token($this->bhw);
        $tokenB = $this->token($this->bhw);
        $this->bhw->update(['role' => 'legacy_role']);

        $this->usingToken($tokenA)->getJson('/api/auth/profile')
            ->assertForbidden()
            ->assertJsonPath('code', 'SESSION_CONTEXT_INVALID');
        $this->assertNull(PersonalAccessToken::findToken($tokenA));
        $this->assertNull(PersonalAccessToken::findToken($tokenB));
    }

    public function test_password_reset_revokes_all_tokens_and_new_credentials_work(): void
    {
        $tokenA = $this->token($this->bhw);
        $tokenB = $this->token($this->bhw);
        $rawResetToken = 'safe-reset-token-for-test';

        PasswordResetRequest::create([
            'user_id' => $this->bhw->id,
            'email' => $this->bhw->email,
            'status' => PasswordResetRequest::STATUS_APPROVED,
            'requested_at' => now(),
            'approved_at' => now(),
            'expires_at' => now()->addHour(),
            'reset_token_hash' => hash('sha256', $rawResetToken),
        ]);

        $this->postJson('/api/auth/password-reset/complete', [
            'token' => $rawResetToken,
            'password' => 'NewSecurePassword9',
            'password_confirmation' => 'NewSecurePassword9',
        ])->assertOk();

        $this->assertNull(PersonalAccessToken::findToken($tokenA));
        $this->assertNull(PersonalAccessToken::findToken($tokenB));
        $this->usingToken($tokenA)->getJson('/api/auth/profile')->assertUnauthorized();
        $this->postJson('/api/auth/login', [
            'email' => $this->bhw->email,
            'password' => 'NewSecurePassword9',
        ])->assertOk();
    }

    public function test_failed_password_reset_does_not_revoke_tokens(): void
    {
        $token = $this->token($this->bhw);

        $this->postJson('/api/auth/password-reset/complete', [
            'token' => 'invalid-reset-token',
            'password' => 'NewSecurePassword9',
            'password_confirmation' => 'NewSecurePassword9',
        ])->assertUnprocessable();

        $this->usingToken($token)->getJson('/api/auth/profile')->assertOk();
    }

    public function test_admin_password_change_revokes_existing_sessions(): void
    {
        $token = $this->token($this->bhw);
        $adminToken = $this->token($this->admin);

        $this->usingToken($adminToken)
            ->patchJson("/api/users/{$this->bhw->id}", [
                'password' => 'AdminChangedPassword9',
            ])->assertOk();

        $this->assertNull(PersonalAccessToken::findToken($token));
        $this->postJson('/api/auth/login', [
            'email' => $this->bhw->email,
            'password' => 'AdminChangedPassword9',
        ])->assertOk();
    }

    public function test_role_and_facility_change_revokes_tokens_and_new_login_uses_new_context(): void
    {
        $token = $this->token($this->bhw);
        $adminToken = $this->token($this->admin);

        $this->usingToken($adminToken)
            ->patchJson("/api/users/{$this->bhw->id}", [
                'role' => User::ROLE_RHU_STAFF,
                'barangay_health_center_id' => null,
                'rural_health_unit_id' => $this->rhuB->id,
            ])->assertOk();

        $this->assertNull(PersonalAccessToken::findToken($token));
        $this->usingToken($token)->getJson('/api/auth/profile')->assertUnauthorized();
        $this->login($this->bhw->fresh())
            ->assertOk()
            ->assertJsonPath('user.role', User::ROLE_RHU_STAFF)
            ->assertJsonPath('user.rural_health_unit_id', $this->rhuB->id);
    }

    public function test_bhc_and_rhu_assignment_changes_revoke_existing_tokens(): void
    {
        $bhwToken = $this->token($this->bhw);
        $rhuUser = $this->user(
            'Session RHU Staff',
            'security-rhu@example.test',
            User::ROLE_RHU_STAFF,
            null,
            $this->rhuA->id
        );
        $rhuToken = $this->token($rhuUser);
        $adminToken = $this->token($this->admin);

        $this->usingToken($adminToken)
            ->patchJson("/api/users/{$this->bhw->id}", [
                'barangay_health_center_id' => $this->bhcB->id,
            ])->assertOk();
        $this->usingToken($adminToken)
            ->patchJson("/api/users/{$rhuUser->id}", [
                'rural_health_unit_id' => $this->rhuB->id,
            ])->assertOk();

        $this->assertNull(PersonalAccessToken::findToken($bhwToken));
        $this->assertNull(PersonalAccessToken::findToken($rhuToken));
    }

    public function test_correcting_a_mixed_assignment_revokes_existing_tokens(): void
    {
        $mixed = $this->user(
            'Mixed Assignment',
            'mixed-session@example.test',
            User::ROLE_BHW,
            $this->bhcA->id,
            $this->rhuA->id
        );
        $token = $this->token($mixed);
        $adminToken = $this->token($this->admin);

        $this->usingToken($adminToken)
            ->patchJson("/api/users/{$mixed->id}", [
                'rural_health_unit_id' => null,
            ])->assertOk();

        $this->assertNull(PersonalAccessToken::findToken($token));
    }

    public function test_harmless_profile_update_does_not_revoke_valid_tokens(): void
    {
        $token = $this->token($this->bhw);
        $adminToken = $this->token($this->admin);

        $this->usingToken($adminToken)
            ->patchJson("/api/users/{$this->bhw->id}", [
                'name' => 'Updated Display Name',
            ])->assertOk();

        $this->assertNotNull(PersonalAccessToken::findToken($token));
        $this->usingToken($token)->getJson('/api/auth/profile')->assertOk();
    }

    public function test_ordinary_authorization_denial_does_not_clear_a_valid_session(): void
    {
        $token = $this->token($this->bhw);

        $this->usingToken($token)->getJson('/api/users')
            ->assertForbidden()
            ->assertJsonPath('code', 'AUTHORIZATION_DENIED');
        $this->usingToken($token)->getJson('/api/auth/profile')->assertOk();
    }

    public function test_revocation_does_not_weaken_facility_isolation(): void
    {
        $token = $this->token($this->bhw);
        $otherPatient = Patient::create([
            'first_name' => 'Other',
            'last_name' => 'Facility',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhcB->id,
        ]);

        $this->usingToken($token)->getJson("/api/patients/{$otherPatient->id}")
            ->assertForbidden();
        $this->usingToken($token)->getJson('/api/auth/profile')->assertOk();
    }

    public function test_auth_audits_do_not_contain_raw_tokens_or_passwords(): void
    {
        $response = $this->login($this->bhw)->assertOk();
        $plainTextToken = $response->json('token');
        $descriptions = AuditLog::query()->pluck('description')->implode(' ');

        $this->assertStringNotContainsString($plainTextToken, $descriptions);
        $this->assertStringNotContainsString('password123', $descriptions);
    }

    private function login(User $user)
    {
        return $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ]);
    }

    private function token(User $user): string
    {
        return $user->createToken('security-test', ['*'], now()->addHours(8))->plainTextToken;
    }

    private function usingToken(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    private function user(
        string $name,
        string $email,
        string $role,
        ?int $bhcId = null,
        ?int $rhuId = null,
        string $status = User::STATUS_ACTIVE
    ): User {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'status' => $status,
            'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $rhuId,
        ]);
    }
}
