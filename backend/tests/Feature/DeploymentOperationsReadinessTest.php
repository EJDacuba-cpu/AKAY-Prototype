<?php

namespace Tests\Feature;

use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Tests\TestCase;

class DeploymentOperationsReadinessTest extends TestCase
{
    public function test_scheduler_registers_hourly_no_show_with_timezone_and_overlap_lock(): void
    {
        $event = $this->scheduledEvent('referrals:mark-no-show');

        $this->assertSame('0 * * * *', $event->expression);
        $this->assertSame(config('app.timezone'), $event->timezone);
        $this->assertTrue($event->withoutOverlapping);
        $this->assertSame(
            config('operations.scheduler.no_show_overlap_minutes'),
            $event->expiresAt
        );
        $this->assertFalse($event->onOneServer);

        $command = Artisan::all()['referrals:mark-no-show'];
        $this->assertTrue($command->getDefinition()->hasOption('dry-run'));
    }

    public function test_scheduler_registers_daily_sanctum_pruning_without_overlap(): void
    {
        $event = $this->scheduledEvent('sanctum:prune-expired');

        $this->assertSame('15 2 * * *', $event->expression);
        $this->assertSame(config('app.timezone'), $event->timezone);
        $this->assertTrue($event->withoutOverlapping);
        $this->assertSame(
            config('operations.scheduler.token_prune_overlap_minutes'),
            $event->expiresAt
        );
        $this->assertFalse($event->onOneServer);
        $this->assertStringContainsString('--hours=24', (string) $event->command);
        $this->assertSame(480, config('sanctum.expiration'));
    }

    public function test_scheduler_registers_daily_health_record_draft_pruning_without_overlap(): void
    {
        $event = $this->scheduledEvent('health-record-drafts:prune');

        $this->assertSame('45 2 * * *', $event->expression);
        $this->assertSame(config('app.timezone'), $event->timezone);
        $this->assertTrue($event->withoutOverlapping);
        $this->assertSame(
            config('operations.scheduler.draft_prune_overlap_minutes'),
            $event->expiresAt
        );
        $this->assertFalse($event->onOneServer);
        $this->assertTrue(
            Artisan::all()['health-record-drafts:prune']
                ->getDefinition()
                ->hasOption('dry-run')
        );
    }

    public function test_liveness_is_safe_rate_limited_and_not_cached(): void
    {
        $response = $this->getJson('/up');

        $response->assertOk()->assertExactJson(['status' => 'ok']);
        $response->assertHeader('X-RateLimit-Limit', '30');
        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control')
        );
        $this->assertStringNotContainsString('database', strtolower($response->getContent()));
    }

    public function test_readiness_returns_safe_success_with_working_database(): void
    {
        $response = $this->getJson('/api/health/ready');

        $response->assertOk()->assertExactJson(['status' => 'ready']);
        $response->assertHeader('X-RateLimit-Limit', '30');
        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control')
        );
    }

    public function test_readiness_failure_is_generic_and_logging_is_sanitized(): void
    {
        Log::spy();
        DB::shouldReceive('selectOne')
            ->once()
            ->andThrow(new RuntimeException(
                'SQLSTATE host=secret.supabase.test password=do-not-log'
            ));

        $response = $this->getJson('/api/health/ready');

        $response->assertStatus(503)->assertExactJson(['status' => 'unavailable']);
        $body = $response->getContent();
        $this->assertStringNotContainsString('SQLSTATE', $body);
        $this->assertStringNotContainsString('supabase', strtolower($body));
        $this->assertStringNotContainsString('password', strtolower($body));
        Log::shouldHaveReceived('warning')
            ->once()
            ->with('AKAY database readiness check failed.', [
                'exception_type' => RuntimeException::class,
            ]);
    }

    public function test_valid_production_preflight_passes_without_printing_secrets(): void
    {
        $this->configureValidProductionReadiness();
        config()->set('app.key', 'base64:deployment-secret-must-not-print');
        config()->set('database.connections.sqlite.password', 'database-secret-must-not-print');

        $exitCode = Artisan::call('akay:deployment-check', ['--production' => true]);
        $output = Artisan::output();

        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('[PASS] Scheduler registrations', $output);
        $this->assertStringNotContainsString('deployment-secret-must-not-print', $output);
        $this->assertStringNotContainsString('database-secret-must-not-print', $output);
        $this->assertStringNotContainsString('example.test', $output);
    }

    public function test_critical_production_preflight_failures_return_nonzero(): void
    {
        $invalidSettings = [
            ['app.debug', true],
            ['app.key', ''],
            ['app.url', 'http://api.example.test'],
            ['cors.allowed_origins', ['*']],
            ['cors.allowed_headers', ['*']],
            ['cors.allowed_headers', ['Authorization', 'Idempotency-Key']],
            ['security.trusted_hosts', ['.*']],
            ['security.trusted_proxies', ['*']],
            ['security.csp.mode', 'report-only'],
            ['logging.channels.daily.level', 'debug'],
        ];

        foreach ($invalidSettings as [$key, $value]) {
            $this->configureValidProductionReadiness();
            config()->set($key, $value);

            $exitCode = Artisan::call('akay:deployment-check', ['--production' => true]);

            $this->assertSame(1, $exitCode, "Preflight should fail for {$key}.");
        }
    }

    public function test_missing_scheduler_registration_fails_preflight(): void
    {
        $this->configureValidProductionReadiness();
        app()->instance(Schedule::class, new Schedule(config('app.timezone')));

        $exitCode = Artisan::call('akay:deployment-check', ['--production' => true]);

        $this->assertSame(1, $exitCode);
        $this->assertStringContainsString(
            '[FAIL] Scheduler registrations',
            Artisan::output()
        );
    }

    public function test_daily_logging_channel_has_configurable_rotation(): void
    {
        $daily = config('logging.channels.daily');

        $this->assertSame('daily', $daily['driver']);
        $this->assertGreaterThan(0, $daily['days']);
        $this->assertArrayHasKey('level', $daily);
    }

    private function scheduledEvent(string $command): Event
    {
        $event = collect(app(Schedule::class)->events())->first(
            fn (Event $event) => str_contains((string) $event->command, $command)
        );

        $this->assertInstanceOf(Event::class, $event);

        return $event;
    }

    private function configureValidProductionReadiness(): void
    {
        config()->set([
            'app.env' => 'production',
            'app.debug' => false,
            'app.key' => 'base64:test-production-key',
            'app.url' => 'https://api.example.test',
            'app.timezone' => 'Asia/Manila',
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
            'cache.default' => 'array',
            'cors.allowed_origins' => ['https://akay.example.test'],
            'cors.allowed_headers' => [
                'Accept',
                'Content-Type',
                'Authorization',
                'Idempotency-Key',
                'X-Health-Record-Draft-ID',
                'X-Requested-With',
            ],
            'security.frontend_url' => 'https://akay.example.test',
            'security.headers_enabled' => true,
            'security.csp.mode' => 'enforce',
            'security.trusted_hosts' => ['^api\.example\.test$'],
            'security.trusted_proxies' => ['10.0.0.0/24'],
            'security.hsts.enabled' => true,
            'security.hsts.max_age' => 31536000,
            'sanctum.expiration' => 480,
            'logging.default' => 'daily',
            'logging.channels.daily.driver' => 'daily',
            'logging.channels.daily.level' => 'warning',
            'logging.channels.daily.days' => 30,
        ]);
    }
}
