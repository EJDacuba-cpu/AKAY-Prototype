<?php

namespace Tests\Feature;

use App\Support\SecurityConfiguration;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use InvalidArgumentException;
use RuntimeException;
use Tests\TestCase;

class ProductionSecurityHeadersTest extends TestCase
{
    private const TRUSTED_ORIGIN = 'https://akay.example.test';

    protected function setUp(): void
    {
        parent::setUp();

        config()->set([
            'app.env' => 'production',
            'app.debug' => false,
            'cors.allowed_origins' => [self::TRUSTED_ORIGIN],
            'cors.allowed_origins_patterns' => SecurityConfiguration::originPatterns([
                self::TRUSTED_ORIGIN,
            ]),
            'cors.allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            'cors.allowed_headers' => [
                'Accept',
                'Content-Type',
                'Authorization',
                'Idempotency-Key',
                'X-Health-Record-Draft-ID',
                'X-AKAY-Session',
                'X-Requested-With',
            ],
            'cors.supports_credentials' => true,
            'security.headers_enabled' => true,
            'security.csp.mode' => 'enforce',
            'security.csp.policy' => implode(' ', [
                "default-src 'self';",
                "object-src 'none';",
                "frame-ancestors 'none';",
                "connect-src 'self' https://api.example.test;",
            ]),
            'security.https_redirect_enabled' => false,
            'security.hsts.enabled' => false,
        ]);

        Route::middleware('api')->group(function (): void {
            Route::get('/api/_security/ok', fn () => response()->json(['ok' => true]));
            Route::post('/api/_security/validation', function () {
                request()->validate(['required_value' => ['required']]);

                return response()->noContent();
            });
            Route::get('/api/_security/forbidden', fn () => abort(403, 'Access denied.'));
            Route::get('/api/_security/hidden', function (): void {
                throw (new AuthorizationException('Resource not found.'))->asNotFound();
            });
            Route::get('/api/_security/error', function (): void {
                throw new RuntimeException(
                    'SQLSTATE secret at C:\\private\\AKAY\\PatientController.php'
                );
            });
            Route::get('/api/_security/private', fn () => response()->json(['ok' => true]))
                ->middleware('sensitive.no-store');
        });
    }

    public function test_known_validation_and_authorization_errors_keep_their_contracts(): void
    {
        $this->postJson('/api/_security/validation', [])->assertStatus(422);

        $this->getJson('/api/_security/forbidden')
            ->assertForbidden()
            ->assertJsonPath('message', 'Access denied.');

        $this->getJson('/api/_security/hidden')->assertNotFound();
    }

    public function test_unexpected_production_api_exception_is_generic(): void
    {
        config()->set('app.debug', true);
        Log::spy();

        $response = $this->getJson('/api/_security/error');

        $response->assertStatus(500)->assertExactJson([
            'message' => 'An unexpected error occurred. Please try again.',
            'code' => 'INTERNAL_SERVER_ERROR',
        ]);

        $body = $response->getContent();
        $this->assertStringNotContainsString('SQLSTATE', $body);
        $this->assertStringNotContainsString('PatientController.php', $body);
        $this->assertStringNotContainsString('trace', strtolower($body));
        Log::shouldHaveReceived('error')
            ->once()
            ->with(
                'Unexpected AKAY API exception.',
                \Mockery::on(function (array $context): bool {
                    $serialized = json_encode($context);

                    return ! str_contains($serialized, 'SQLSTATE')
                        && ! str_contains($serialized, 'PatientController.php');
                })
            );
    }

    public function test_configured_origin_receives_restricted_cors_preflight_headers(): void
    {
        $response = $this->call('OPTIONS', '/api/auth/login', [], [], [], [
            'HTTP_ORIGIN' => self::TRUSTED_ORIGIN,
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'Authorization, Idempotency-Key, X-Health-Record-Draft-ID, X-AKAY-Session',
        ]);

        $response->assertNoContent();
        $response->assertHeader('Access-Control-Allow-Origin', self::TRUSTED_ORIGIN);
        $this->assertStringContainsString(
            'authorization',
            strtolower((string) $response->headers->get('Access-Control-Allow-Headers'))
        );
        $this->assertStringContainsString(
            'idempotency-key',
            strtolower((string) $response->headers->get('Access-Control-Allow-Headers'))
        );
        $this->assertStringContainsString(
            'x-health-record-draft-id',
            strtolower((string) $response->headers->get('Access-Control-Allow-Headers'))
        );
        $this->assertStringContainsString(
            'x-akay-session',
            strtolower((string) $response->headers->get('Access-Control-Allow-Headers'))
        );
        $allowedMethods = (string) $response->headers->get('Access-Control-Allow-Methods');
        foreach (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as $method) {
            $this->assertStringContainsString($method, $allowedMethods);
        }
        $response->assertHeader('Access-Control-Allow-Credentials', 'true');
    }

    public function test_unknown_origin_does_not_receive_cors_permission(): void
    {
        $response = $this->call('OPTIONS', '/api/auth/login', [], [], [], [
            'HTTP_ORIGIN' => 'https://untrusted.example.test',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
        ]);

        $this->assertNotSame('*', $response->headers->get('Access-Control-Allow-Origin'));
        $this->assertNull($response->headers->get('Access-Control-Allow-Origin'));
        $this->assertFalse($response->headers->has('Access-Control-Allow-Credentials'));
    }

    public function test_origin_parser_rejects_wildcards_and_malformed_origins(): void
    {
        foreach (['*', 'https://*.example.test', 'javascript:alert(1)', 'https://example.test/path'] as $origin) {
            try {
                SecurityConfiguration::parseOrigins($origin);
                $this->fail("Origin should have been rejected: {$origin}");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_baseline_headers_and_enforced_csp_are_present(): void
    {
        $response = $this->getJson('/api/_security/ok');

        $response->assertOk();
        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->assertHeader('X-Frame-Options', 'DENY');
        $response->assertHeader('Cross-Origin-Opener-Policy', 'same-origin');

        $permissions = (string) $response->headers->get('Permissions-Policy');
        $this->assertStringContainsString('camera=(self)', $permissions);
        $this->assertStringContainsString('microphone=()', $permissions);
        $this->assertStringContainsString('geolocation=()', $permissions);
        $this->assertStringContainsString('payment=()', $permissions);

        $csp = (string) $response->headers->get('Content-Security-Policy');
        $this->assertStringContainsString("frame-ancestors 'none'", $csp);
        $this->assertStringContainsString("object-src 'none'", $csp);
        $this->assertStringContainsString(
            "connect-src 'self' https://api.example.test",
            $csp
        );
    }

    public function test_security_and_sensitive_no_store_headers_coexist(): void
    {
        $response = $this->getJson('/api/_security/private');

        $response->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control')
        );
        $this->assertStringContainsString(
            'private',
            (string) $response->headers->get('Cache-Control')
        );
        $response->assertHeader('Pragma', 'no-cache');
        $this->assertStringContainsString(
            'Authorization',
            (string) $response->headers->get('Vary')
        );
    }

    public function test_hsts_is_only_emitted_for_secure_production_requests_when_enabled(): void
    {
        config()->set('security.hsts.enabled', true);
        config()->set('security.hsts.max_age', 31536000);
        config()->set('security.hsts.include_subdomains', true);

        $this->getJson('/api/_security/ok')
            ->assertHeaderMissing('Strict-Transport-Security');

        $this->getJson('https://localhost/api/_security/ok')
            ->assertHeader(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains'
            );

        config()->set('app.env', 'local');
        $this->getJson('https://localhost/api/_security/ok')
            ->assertHeaderMissing('Strict-Transport-Security');
    }

    public function test_hsts_never_uses_preload_implicitly(): void
    {
        config()->set('security.hsts.enabled', true);

        $response = $this->getJson('https://localhost/api/_security/ok');

        $this->assertStringNotContainsString(
            'preload',
            strtolower((string) $response->headers->get('Strict-Transport-Security'))
        );
    }

    public function test_https_enforcement_does_not_redirect_api_tokens_or_queries(): void
    {
        config()->set('security.https_redirect_enabled', true);

        $response = $this->getJson('/api/_security/ok?token=must-not-be-reflected');

        $response->assertStatus(426)->assertExactJson([
            'message' => 'A secure HTTPS connection is required.',
            'code' => 'HTTPS_REQUIRED',
        ]);
        $response->assertHeaderMissing('Location');
        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control')
        );
    }

    public function test_forwarded_https_is_honored_only_from_a_configured_proxy(): void
    {
        config()->set('security.hsts.enabled', true);

        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.50'])
            ->withHeader('X-Forwarded-Proto', 'https')
            ->getJson('/api/_security/ok')
            ->assertHeaderMissing('Strict-Transport-Security');

        config()->set('security.trusted_proxies', ['REMOTE_ADDR']);

        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.50'])
            ->withHeader('X-Forwarded-Proto', 'https')
            ->getJson('/api/_security/ok')
            ->assertHeader(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains'
            );
    }
}
