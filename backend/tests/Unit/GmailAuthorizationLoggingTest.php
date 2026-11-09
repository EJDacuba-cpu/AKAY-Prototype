<?php

namespace Tests\Unit;

use App\Providers\AppServiceProvider;
use Illuminate\Config\Repository;
use Illuminate\Container\Container;
use Illuminate\Support\Facades\Facade;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class GmailAuthorizationLoggingTest extends TestCase
{
    private Container $container;

    private array $warnings = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->container = new Container;
        Container::setInstance($this->container);
        Facade::setFacadeApplication($this->container);
        $this->container->instance('config', new Repository([
            'services' => ['google_gmail' => [
                'client_id' => 'test-client',
                'client_secret' => 'secret-must-not-be-logged',
                'refresh_token' => 'token-must-not-be-logged',
            ]],
        ]));
        Log::swap(Mockery::mock());
        Log::shouldReceive('warning')->andReturnUsing(function ($message, $context): void {
            $this->warnings[] = [$message, $context];
        });
        Mail::swap(Mockery::mock());
        RateLimiter::swap(Mockery::mock());
        RateLimiter::shouldReceive('for');
    }

    protected function tearDown(): void
    {
        Mockery::close();
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication(null);
        Container::setInstance(null);
        parent::tearDown();
    }

    private function resolveFailingTransport(string $expectedMessage): void
    {
        $factory = null;
        Mail::shouldReceive('extend')->once()->with('gmail_api', Mockery::on(function ($callback) use (&$factory) {
            $factory = $callback;

            return true;
        }));
        (new AppServiceProvider($this->container))->boot();

        try {
            $factory();
            $this->fail('The transport should still reject invalid authorization.');
        } catch (RuntimeException $exception) {
            $this->assertSame($expectedMessage, $exception->getMessage());
        }
    }

    public function test_missing_credentials_are_identified_without_logging_values(): void
    {
        $this->container['config']->set('services.google_gmail.refresh_token', null);
        $this->resolveFailingTransport('Gmail API credentials are not configured.');

        $this->assertSame([
            ['Gmail API initialization failed.', ['category' => 'gmail_credentials_missing']],
        ], $this->warnings);
    }

    public static function oauthErrors(): array
    {
        return [
            'expired or revoked grant' => ['invalid_grant', 'invalid_grant'],
            'client rejected' => ['invalid_client', 'invalid_client'],
            'unexpected sensitive error' => ['secret-token-and-invitation-link', 'unclassified'],
            'missing error' => [null, 'unclassified'],
        ];
    }

    #[DataProvider('oauthErrors')]
    public function test_refresh_failure_logs_only_allowlisted_error_codes(?string $error, string $expected): void
    {
        // Replace the SDK in the container: no OAuth or Gmail requests are made.
        $client = Mockery::mock(\Google\Client::class);
        $this->container->instance(\Google\Client::class, $client);
        $client->shouldReceive('setClientId')->once()->with('test-client');
        $client->shouldReceive('setClientSecret')->once()->with('secret-must-not-be-logged');
        $client->shouldReceive('fetchAccessTokenWithRefreshToken')->once()
            ->with('token-must-not-be-logged')->andReturn([
                'error' => $error,
                'error_description' => 'raw-response-must-not-be-logged',
            ]);
        $this->resolveFailingTransport('Gmail API authorization failed.');

        $this->assertSame([
            ['Gmail API initialization failed.', [
                'category' => 'gmail_oauth_authorization_failed',
                'oauth_error' => $expected,
            ]],
        ], $this->warnings);
    }
}
