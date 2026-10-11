<?php

namespace Tests\Feature;

use App\Models\AccountInvite;
use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\PasswordResetRequest;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\AccountInviteService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class TemporaryPasswordSignInTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private AccountInvite $invite;

    private string $temporary;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        RateLimiter::clear('temp-bhw@example.test|127.0.0.1');

        $rhu = RuralHealthUnit::create(['name' => 'Temp RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Temp BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $admin = User::create(['name' => 'MHO', 'email' => 'temp-mho@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []]);
        $this->user = User::create([
            'name' => 'Temp BHW', 'email' => 'temp-bhw@example.test', 'password' => bin2hex(random_bytes(16)),
            'role' => 'bhc', 'status' => 'active', 'barangay_health_center_id' => $bhc->id, 'permissions' => [],
        ]);

        $this->invite = app(AccountInviteService::class)->issue($this->user, $admin);
        $this->temporary = app(AccountInviteService::class)->temporaryPassword($this->invite);
    }

    private function signIn(): array
    {
        $response = $this->postJson('/api/auth/login', [
            'email' => $this->user->email,
            'password' => $this->temporary,
        ])->assertOk();

        $this->app['auth']->forgetGuards();

        return [$response->json('token'), $response];
    }

    public function test_signing_in_with_a_temporary_password_flags_the_session(): void
    {
        [, $response] = $this->signIn();

        $response->assertJsonPath('user.must_change_password', true);
    }

    public function test_other_routes_are_blocked_until_the_password_changes(): void
    {
        [$token] = $this->signIn();

        $this->withToken($token)->getJson('/api/patients')
            ->assertForbidden()
            ->assertJsonPath('code', 'PASSWORD_CHANGE_REQUIRED');

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/auth/profile')
            ->assertOk()
            ->assertJsonPath('user.must_change_password', true);

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->postJson('/api/auth/logout')->assertOk();
    }

    public function test_changing_the_password_clears_the_flags_and_completes_the_invite(): void
    {
        [$token] = $this->signIn();

        $token = $this->withToken($token)->postJson('/api/auth/change-password', [
            'current_password' => $this->temporary,
            'password' => 'Brandnew123',
            'password_confirmation' => 'Brandnew123',
        ])
            ->assertOk()
            ->assertJsonPath('message', 'Password changed.')
            ->assertJsonPath('user.must_change_password', false)
            ->json('token');

        $this->user->refresh();
        $this->assertTrue(Hash::check('Brandnew123', $this->user->password));
        $this->assertFalse((bool) $this->user->must_change_password);
        $this->assertNull($this->user->temp_password_expires_at);

        $invite = $this->invite->fresh();
        $this->assertSame(AccountInvite::STATUS_COMPLETED, $invite->status);
        $this->assertSame(AccountInvite::VIA_TEMPORARY_PASSWORD, $invite->completed_via);

        $audit = AuditLog::where('action', 'password changed')->first();
        $this->assertNotNull($audit);
        $this->assertStringNotContainsString('Brandnew123', json_encode($audit->toArray()));
        $this->assertStringNotContainsString($this->temporary, json_encode($audit->toArray()));

        $this->app['auth']->forgetGuards();
        $response = $this->withToken($token)->getJson('/api/patients');
        $this->assertNotSame('PASSWORD_CHANGE_REQUIRED', $response->json('code'));
        $this->assertNotSame(401, $response->status());

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/notifications')->assertOk();
    }

    public function test_an_expired_temporary_password_cannot_sign_in(): void
    {
        $this->travel(73)->hours();

        $this->postJson('/api/auth/login', [
            'email' => $this->user->email,
            'password' => $this->temporary,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TEMP_PASSWORD_EXPIRED')
            ->assertJsonPath('message', 'This temporary password has expired. Ask the MHO for a new one.');
    }

    public function test_the_new_password_must_differ_and_follow_the_rules(): void
    {
        [$token] = $this->signIn();

        $change = function (array $body) use ($token) {
            $this->app['auth']->forgetGuards();

            return $this->withToken($token)->postJson('/api/auth/change-password', $body);
        };

        $change([
            'current_password' => $this->temporary,
            'password' => $this->temporary,
            'password_confirmation' => $this->temporary,
        ])->assertUnprocessable()->assertJsonValidationErrors('password');

        $change([
            'current_password' => $this->temporary,
            'password' => 'weakpass',
            'password_confirmation' => 'weakpass',
        ])->assertUnprocessable()->assertJsonValidationErrors('password');

        $change([
            'current_password' => 'Wrongcurrent123',
            'password' => 'Brandnew123',
            'password_confirmation' => 'Brandnew123',
        ])->assertUnprocessable()->assertJsonValidationErrors('current_password');

        $this->assertTrue((bool) $this->user->fresh()->must_change_password);
    }

    public function test_changing_the_password_ends_other_sessions_and_returns_a_working_one(): void
    {
        [$first] = $this->signIn();
        [$second] = $this->signIn();

        $response = $this->withToken($first)->postJson('/api/auth/change-password', [
            'current_password' => $this->temporary,
            'password' => 'Brandnew123',
            'password_confirmation' => 'Brandnew123',
        ])->assertOk()
            ->assertJsonPath('message', 'Password changed.')
            ->assertJsonPath('user.must_change_password', false);

        $fresh = $response->json('token');
        $this->assertNotEmpty($fresh);

        foreach ([$first, $second] as $old) {
            $this->app['auth']->forgetGuards();
            $this->withToken($old)->getJson('/api/auth/profile')->assertUnauthorized();
        }

        $this->app['auth']->forgetGuards();
        $this->withToken($fresh)->getJson('/api/auth/profile')
            ->assertOk()
            ->assertJsonPath('user.must_change_password', false);
        $this->app['auth']->forgetGuards();
        $this->withToken($fresh)->getJson('/api/notifications')->assertOk();
    }

    public function test_a_temporary_password_without_an_expiry_cannot_sign_in(): void
    {
        $this->user->forceFill(['temp_password_expires_at' => null])->save();

        $this->postJson('/api/auth/login', [
            'email' => $this->user->email,
            'password' => $this->temporary,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'TEMP_PASSWORD_EXPIRED');
    }

    public function test_a_voluntary_change_without_a_temporary_password_completes_nothing(): void
    {
        $this->user->forceFill([
            'password' => 'Ownpass123',
            'must_change_password' => false,
            'temp_password_expires_at' => null,
        ])->save();
        $reset = PasswordResetRequest::create([
            'user_id' => $this->user->id,
            'email' => $this->user->email,
            'status' => PasswordResetRequest::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $token = $this->postJson('/api/auth/login', ['email' => $this->user->email, 'password' => 'Ownpass123'])
            ->assertOk()
            ->json('token');
        $this->app['auth']->forgetGuards();

        $this->withToken($token)->postJson('/api/auth/change-password', [
            'current_password' => 'Ownpass123',
            'password' => 'Brandnew123',
            'password_confirmation' => 'Brandnew123',
        ])->assertOk()->assertJsonPath('user.must_change_password', false);

        $this->assertTrue(Hash::check('Brandnew123', $this->user->fresh()->password));
        $this->assertSame(PasswordResetRequest::STATUS_PENDING, $reset->fresh()->status);
        $this->assertSame(AccountInvite::STATUS_TEMPORARY, $this->invite->fresh()->status);
    }

    public function test_a_password_reset_clears_the_temporary_password_flags(): void
    {
        PasswordResetRequest::create([
            'user_id' => $this->user->id,
            'email' => $this->user->email,
            'status' => PasswordResetRequest::STATUS_APPROVED,
            'requested_at' => now(),
            'approved_at' => now(),
            'expires_at' => now()->addMinutes(60),
            'reset_token_hash' => hash('sha256', 'reset-token'),
            'delivery' => PasswordResetRequest::DELIVERY_SENT,
        ]);

        $this->postJson('/api/auth/password-reset/complete', [
            'token' => 'reset-token',
            'password' => 'Resetpass123',
            'password_confirmation' => 'Resetpass123',
        ])->assertOk();

        $this->user->refresh();
        $this->assertFalse((bool) $this->user->must_change_password);
        $this->assertNull($this->user->temp_password_expires_at);

        $invite = $this->invite->fresh();
        $this->assertSame(AccountInvite::STATUS_COMPLETED, $invite->status);
        $this->assertSame(AccountInvite::VIA_RESET, $invite->completed_via);

        $this->travel(73)->hours();

        $this->postJson('/api/auth/login', [
            'email' => $this->user->email,
            'password' => 'Resetpass123',
        ])->assertOk()->assertJsonPath('user.must_change_password', false);
    }
}
