<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class AuthenticationPersistenceTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'https://akay.example.test';

    private BarangayHealthCenter $bhc;

    private RuralHealthUnit $rhu;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set([
            'cors.allowed_origins' => [self::ORIGIN],
            'auth_persistence.cookie.secure' => false,
            'auth_persistence.cookie.same_site' => 'lax',
            'auth_persistence.access_token_minutes' => 15,
            'auth_persistence.refresh_token_minutes' => 480,
            'auth_persistence.refresh_idle_minutes' => 120,
        ]);
        $this->rhu = RuralHealthUnit::create(['name' => 'Persistence RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Persistence BHC',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->user = $this->newBhw('persistent@example.test');
    }

    public function test_login_sets_narrow_httponly_refresh_cookie_and_safe_json(): void
    {
        $response = $this->login($this->user)->assertOk();
        $cookie = $this->refreshCookieFrom($response);

        $this->assertTrue($cookie->isHttpOnly());
        $this->assertFalse($cookie->isSecure());
        $this->assertSame('lax', $cookie->getSameSite());
        $this->assertSame('/api/auth', $cookie->getPath());
        $this->assertNull($cookie->getDomain());
        $this->assertGreaterThan(time(), $cookie->getExpiresTime());
        $response
            ->assertJsonStructure([
                'token',
                'token_type',
                'expires_at',
                'user' => ['id', 'name', 'role', 'status', 'facility', 'navigation'],
            ])
            ->assertJsonMissingPath('refresh_token')
            ->assertJsonMissingPath('user.email')
            ->assertJsonMissingPath('user.password')
            ->assertJsonMissingPath('user.remember_token')
            ->assertJsonMissingPath('user.tokens');
        $this->assertStringNotContainsString($cookie->getValue(), $response->getContent());
    }

    public function test_production_cookie_is_secure_and_none_is_never_insecure(): void
    {
        config()->set([
            'auth_persistence.cookie.secure' => true,
            'auth_persistence.cookie.same_site' => 'none',
        ]);

        $cookie = $this->refreshCookieFrom($this->login($this->user));

        $this->assertTrue($cookie->isSecure());
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('none', $cookie->getSameSite());
    }

    public function test_refresh_rotates_cookie_and_restores_allowlisted_user(): void
    {
        $login = $this->login($this->user)->assertOk();
        $oldCookie = $this->refreshCookieFrom($login);
        $oldToken = PersonalAccessToken::findToken($oldCookie->getValue());

        $response = $this->refresh($oldCookie->getValue())
            ->assertOk()
            ->assertJsonPath('user.role', User::ROLE_BHW)
            ->assertJsonPath('user.facility.id', $this->bhc->id)
            ->assertJsonPath('user.navigation.home', '/bhc/dashboard');
        $newCookie = $this->refreshCookieFrom($response);
        $newRefreshToken = PersonalAccessToken::findToken($newCookie->getValue());

        $this->assertNull(PersonalAccessToken::find($oldToken->id));
        $this->assertNotSame($oldCookie->getValue(), $newCookie->getValue());
        $this->assertTrue($oldToken->expires_at->equalTo($newRefreshToken->expires_at));
        $this->assertNotNull(PersonalAccessToken::findToken($response->json('token')));
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        $this->assertStringContainsString('Cookie', (string) $response->headers->get('Vary'));
    }

    public function test_revoked_and_expired_refresh_sessions_cannot_restore(): void
    {
        $revokedCookie = $this->refreshCookieFrom($this->login($this->user));
        PersonalAccessToken::findToken($revokedCookie->getValue())->delete();
        $this->refresh($revokedCookie->getValue())
            ->assertUnauthorized()
            ->assertJsonPath('code', 'SESSION_INVALID');

        $expiredCookie = $this->refreshCookieFrom($this->login($this->user));
        PersonalAccessToken::findToken($expiredCookie->getValue())
            ->forceFill(['expires_at' => now()->subMinute()])
            ->save();
        $this->refresh($expiredCookie->getValue())
            ->assertUnauthorized()
            ->assertJsonPath('code', 'SESSION_EXPIRED');

        $idleCookie = $this->refreshCookieFrom($this->login($this->user));
        PersonalAccessToken::findToken($idleCookie->getValue())
            ->forceFill(['last_used_at' => now()->subMinutes(121)])
            ->save();
        $this->refresh($idleCookie->getValue())
            ->assertUnauthorized()
            ->assertJsonPath('code', 'SESSION_EXPIRED');
    }

    public function test_invalid_account_and_facility_contexts_cannot_restore(): void
    {
        $cases = [
            'inactive-user' => fn (User $user) => $user->update(['status' => User::STATUS_INACTIVE]),
            'missing-facility' => fn (User $user) => $user->update(['barangay_health_center_id' => null]),
            'mixed-facility' => fn (User $user) => $user->update(['rural_health_unit_id' => $this->rhu->id]),
            'changed-role' => fn (User $user) => $user->update(['role' => User::ROLE_ADMIN]),
            'inactive-facility' => function (): void {
                $this->bhc->update(['status' => 'inactive']);
            },
        ];

        foreach ($cases as $name => $invalidate) {
            $user = $this->newBhw("{$name}@example.test");
            $cookie = $this->refreshCookieFrom($this->login($user));
            $invalidate($user);

            $this->refresh($cookie->getValue())
                ->assertUnauthorized()
                ->assertJsonPath('code', 'SESSION_INVALID');

            $this->bhc->update(['status' => 'active']);
        }
    }

    public function test_logout_revokes_access_and_refresh_and_clears_cookie(): void
    {
        $login = $this->login($this->user);
        $access = $login->json('token');
        $refresh = $this->refreshCookieFrom($login)->getValue();

        $logout = $this->withToken($access)
            ->withCredentials()
            ->withUnencryptedCookie(config('auth_persistence.cookie.name'), $refresh)
            ->withHeaders($this->sessionHeaders())
            ->postJson('/api/auth/logout')
            ->assertOk();

        $this->assertNull(PersonalAccessToken::findToken($access));
        $this->assertNull(PersonalAccessToken::findToken($refresh));
        $this->assertLessThan(time(), $this->refreshCookieFrom($logout)->getExpiresTime());
        $this->refresh($refresh)->assertUnauthorized();
    }

    public function test_origin_and_custom_header_protect_cookie_session_actions(): void
    {
        $this->withHeader('Origin', self::ORIGIN)
            ->postJson('/api/auth/login', [
                'email' => $this->user->email,
                'password' => 'password123',
            ])
            ->assertStatus(419);

        $this->withHeaders([
            'Origin' => 'https://malicious.example.test',
            'X-AKAY-Session' => '1',
        ])->postJson('/api/auth/login', [
            'email' => $this->user->email,
            'password' => 'password123',
        ])->assertStatus(419);

        $this->login($this->user)->assertOk();
    }

    public function test_refresh_credential_cannot_be_used_as_api_bearer(): void
    {
        $refresh = $this->refreshCookieFrom($this->login($this->user))->getValue();

        $this->withToken($refresh)
            ->getJson('/api/auth/profile')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'SESSION_INVALID');
    }

    private function login(User $user)
    {
        return $this->withHeaders($this->sessionHeaders())->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ]);
    }

    private function refresh(string $cookie)
    {
        return $this->withCredentials()
            ->withUnencryptedCookie(config('auth_persistence.cookie.name'), $cookie)
            ->withHeaders($this->sessionHeaders())
            ->postJson('/api/auth/refresh');
    }

    private function sessionHeaders(): array
    {
        return ['Origin' => self::ORIGIN, 'X-AKAY-Session' => '1'];
    }

    private function refreshCookieFrom($response)
    {
        return collect($response->headers->getCookies())->first(
            fn ($cookie) => $cookie->getName() === config('auth_persistence.cookie.name')
        );
    }

    private function newBhw(string $email): User
    {
        return User::create([
            'name' => 'Persistent BHW',
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }
}
