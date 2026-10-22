<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\TurnstileVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class TurnstileLoginTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $rhu = RuralHealthUnit::create(['name' => 'Turnstile RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create([
            'name' => 'Turnstile BHC',
            'status' => 'active',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->user = User::create([
            'name' => 'Turnstile BHW',
            'email' => 'turnstile-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHC,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);
    }

    public function test_login_requires_a_turnstile_token_before_authentication(): void
    {
        $this->postJson('/api/auth/login', [
            'email' => $this->user->email,
            'password' => 'password123',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('turnstile_token')
            ->assertJsonFragment(['Complete the bot check before signing in.']);

        Http::assertNothingSent();
        $this->assertSame(0, $this->user->tokens()->count());
    }

    public function test_oversized_captcha_tokens_are_rejected_without_siteverify(): void
    {
        $this->postJson('/api/auth/login', [
            'email' => $this->user->email,
            'password' => 'password123',
            'turnstile_token' => str_repeat('a', 2049),
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('turnstile_token');

        Http::assertNothingSent();
        $this->assertSame(0, $this->user->tokens()->count());
    }

    public function test_invalid_captcha_is_rejected_before_password_authentication(): void
    {
        $this->fakeTurnstileResponse([
            'success' => false,
            'error-codes' => ['invalid-input-response'],
        ]);

        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->user->email,
            'password' => 'password123',
        ]))
            ->assertUnprocessable()
            ->assertExactJson([
                'message' => 'Bot verification failed. Refresh the check and try again.',
                'code' => 'CAPTCHA_FAILED',
            ]);

        Http::assertSentCount(1);
        $this->assertSame(0, $this->user->tokens()->count());
    }

    public function test_reused_or_expired_captcha_tokens_are_rejected(): void
    {
        $this->fakeTurnstileResponse([
            'success' => false,
            'error-codes' => ['timeout-or-duplicate'],
        ]);

        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->user->email,
            'password' => 'password123',
        ]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'CAPTCHA_FAILED')
            ->assertJsonPath(
                'message',
                'This bot check has expired or was already used. Refresh the check and try again.'
            );
    }

    public function test_cloudflare_outage_fails_closed_without_issuing_a_session(): void
    {
        $this->fakeTurnstileResponse('upstream error', 503);

        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->user->email,
            'password' => 'password123',
        ]))
            ->assertStatus(503)
            ->assertExactJson([
                'message' => 'Bot protection is temporarily unavailable. Please try again in a moment.',
                'code' => 'CAPTCHA_UNAVAILABLE',
            ]);

        $this->assertSame(0, $this->user->tokens()->count());
    }

    public function test_unreachable_siteverify_fails_closed(): void
    {
        $this->fakeUnreachableTurnstile();

        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->user->email,
            'password' => 'password123',
        ]))
            ->assertStatus(503)
            ->assertJsonPath('code', 'CAPTCHA_UNAVAILABLE');
    }

    public function test_production_rejects_official_testing_credentials_without_calling_siteverify(): void
    {
        $this->app['env'] = 'production';
        config([
            'app.env' => 'production',
            'security.https_redirect_enabled' => false,
            'services.turnstile.site_key' => TurnstileVerifier::DUMMY_SITE_KEYS[0],
            'services.turnstile.secret' => TurnstileVerifier::DUMMY_SECRET_KEYS[0],
        ]);

        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->user->email,
            'password' => 'password123',
        ]))
            ->assertStatus(503)
            ->assertJsonPath('code', 'CAPTCHA_UNAVAILABLE');

        Http::assertNothingSent();
        $this->assertSame(0, $this->user->tokens()->count());
    }

    public function test_production_rejects_dummy_tokens_even_with_real_looking_keys(): void
    {
        $this->app['env'] = 'production';
        config([
            'app.env' => 'production',
            'security.https_redirect_enabled' => false,
            'services.turnstile.site_key' => '0x4AAAAAABproductionSiteKey12',
            'services.turnstile.secret' => '0x4AAAAAABproductionSecretKey12',
        ]);

        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->user->email,
            'password' => 'password123',
        ]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'CAPTCHA_FAILED');

        Http::assertNothingSent();
    }

    public function test_valid_captcha_still_enforces_password_and_account_checks(): void
    {
        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->user->email,
            'password' => 'WrongPassword9',
        ]))
            ->assertUnprocessable()
            ->assertExactJson([
                'message' => 'The provided credentials are incorrect.',
                'code' => 'LOGIN_FAILED',
            ]);

        Http::assertSentCount(1);
        $this->assertSame(0, $this->user->tokens()->count());
    }

    public function test_valid_captcha_issues_a_session_and_does_not_log_the_token(): void
    {
        Log::spy();

        $response = $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->user->email,
            'password' => 'password123',
        ]))->assertOk()->assertJsonStructure(['token', 'user']);

        $this->assertNotNull(PersonalAccessToken::findToken($response->json('token')));
        Http::assertSent(function ($request) {
            return $request->url() === TurnstileVerifier::SITEVERIFY_URL
                && $request->data()['response'] === self::TEST_TURNSTILE_TOKEN
                && $request->data()['secret'] === config('services.turnstile.secret');
        });

        Log::shouldNotHaveReceived('warning');
        Log::shouldNotHaveReceived('error');
        Log::shouldNotHaveReceived('info', function ($message, $context = []) {
            return str_contains((string) $message, self::TEST_TURNSTILE_TOKEN)
                || str_contains(json_encode($context) ?: '', self::TEST_TURNSTILE_TOKEN)
                || str_contains(json_encode($context) ?: '', (string) config('services.turnstile.secret'));
        });
    }

    public function test_failed_verification_logs_do_not_include_tokens_or_secrets(): void
    {
        Log::spy();
        $this->fakeTurnstileResponse([
            'success' => false,
            'error-codes' => ['invalid-input-response'],
        ]);

        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->user->email,
            'password' => 'password123',
        ]))->assertUnprocessable();

        Log::shouldNotHaveReceived('warning', function ($message, $context = []) {
            $encoded = json_encode([$message, $context]) ?: '';

            return str_contains($encoded, self::TEST_TURNSTILE_TOKEN)
                || str_contains($encoded, (string) config('services.turnstile.secret'));
        });
    }

    public function test_session_refresh_does_not_require_captcha(): void
    {
        $login = $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $this->user->email,
            'password' => 'password123',
        ]))->assertOk();

        $refresh = collect($login->headers->getCookies())->first(
            fn ($cookie) => $cookie->getName() === config('auth_persistence.cookie.name')
        );
        $this->assertNotNull($refresh);

        Http::assertSentCount(1);

        $this->withCredentials()
            ->withUnencryptedCookie(config('auth_persistence.cookie.name'), $refresh->getValue())
            ->postJson('/api/auth/refresh')
            ->assertOk()
            ->assertJsonStructure(['token', 'user']);

        Http::assertSentCount(1);
    }

    public function test_csp_allows_the_turnstile_widget(): void
    {
        $csp = (string) config('security.csp.policy');

        $this->assertStringContainsString("script-src 'self' https://challenges.cloudflare.com", $csp);
        $this->assertStringContainsString('frame-src https://challenges.cloudflare.com', $csp);
        $this->assertStringContainsString('https://challenges.cloudflare.com', $csp);
    }

    public function test_siteverify_keeps_tls_verification_enabled_with_a_ca_bundle(): void
    {
        $bundle = base_path('certs/cacert.pem');
        if (! is_readable($bundle)) {
            $this->markTestSkipped('Local CA bundle is not present.');
        }

        config(['services.turnstile.ca_bundle' => $bundle]);
        $method = new \ReflectionMethod(TurnstileVerifier::class, 'httpOptions');
        $options = $method->invoke(app(TurnstileVerifier::class));

        $this->assertSame($bundle, $options['verify'] ?? null);
        $this->assertNotFalse($options['verify']);
    }
}
