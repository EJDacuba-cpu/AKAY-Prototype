<?php

namespace App\Services;

use App\Support\SecurityConfiguration;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DeploymentReadinessService
{
    /**
     * @return array<int, array{name: string, passed: bool}>
     */
    public function checks(bool $production): array
    {
        return [
            $this->check('Application environment', fn () => ! $production
                || config('app.env') === 'production'),
            $this->check('Debug mode policy', fn () => ! $production
                || config('app.debug') === false),
            $this->check('Application key configured', fn () => filled(config('app.key'))),
            $this->check('Application URL', fn () => $this->validApplicationUrl($production)),
            $this->check('Application timezone', fn () => in_array(
                config('app.timezone'),
                timezone_identifiers_list(),
                true
            )),
            $this->check('Database configuration', fn () => $this->databaseConfigured()),
            $this->check('Database connectivity', fn () => $this->databaseReachable()),
            $this->check('CORS origins', fn () => $this->validCorsOrigins($production)),
            $this->check('CORS request headers', fn () => $this->validCorsHeaders()),
            $this->check('Authentication cookie policy', fn () => $this->validAuthenticationCookie($production)),
            $this->check('Frontend URL', fn () => $this->validFrontendUrl($production)),
            $this->check('Token expiration', fn () => $this->validTokenExpiration()),
            $this->check('Security headers policy', fn () => ! $production
                || config('security.headers_enabled') === true),
            $this->check('CSP policy', fn () => ! $production
                || config('security.csp.mode') === 'enforce'),
            $this->check('Trusted hosts', fn () => $this->validTrustedHosts($production)),
            $this->check('Trusted proxies', fn () => $this->validTrustedProxies()),
            $this->check('HSTS consistency', fn () => $this->validHstsConfiguration()),
            $this->check('Scheduler registrations', fn () => $this->schedulerRegistered()),
            $this->check('Log storage writable', fn () => $this->logStorageWritable()),
            $this->check('Log rotation policy', fn () => $this->validLogging($production)),
            $this->check('Cache store usable', fn () => $this->cacheUsable()),
            $this->check('Frontend deployment documentation', fn () => is_file(
                base_path('../docs/deployment-operations.md')
            ) && is_file(base_path('../frontend/.env.example'))),
        ];
    }

    /**
     * @param  callable(): bool  $callback
     * @return array{name: string, passed: bool}
     */
    private function check(string $name, callable $callback): array
    {
        try {
            $passed = $callback() === true;
        } catch (\Throwable) {
            $passed = false;
        }

        return compact('name', 'passed');
    }

    private function validApplicationUrl(bool $production): bool
    {
        $url = filter_var(config('app.url'), FILTER_VALIDATE_URL);

        if ($url === false) {
            return false;
        }

        return ! $production || parse_url($url, PHP_URL_SCHEME) === 'https';
    }

    private function databaseConfigured(): bool
    {
        $connection = config('database.default');
        $settings = config("database.connections.{$connection}");

        if (! is_string($connection) || $connection === '' || ! is_array($settings)) {
            return false;
        }

        if (filled($settings['url'] ?? null)) {
            return true;
        }

        if (($settings['driver'] ?? null) === 'sqlite') {
            return filled($settings['database'] ?? null);
        }

        return filled($settings['driver'] ?? null)
            && filled($settings['host'] ?? null)
            && filled($settings['database'] ?? null)
            && filled($settings['username'] ?? null);
    }

    private function databaseReachable(): bool
    {
        DB::selectOne('select 1 as deployment_check');

        return true;
    }

    private function validCorsOrigins(bool $production): bool
    {
        $origins = config('cors.allowed_origins', []);

        if (! is_array($origins) || ($production && $origins === [])) {
            return false;
        }

        return SecurityConfiguration::parseOrigins(...$origins) === array_values($origins);
    }

    private function validFrontendUrl(bool $production): bool
    {
        $frontendUrl = config('security.frontend_url');

        if (! is_string($frontendUrl) || $frontendUrl === '') {
            return false;
        }

        $origin = SecurityConfiguration::originFromUrl($frontendUrl);

        return $origin === $frontendUrl
            && (! $production || str_starts_with($frontendUrl, 'https://'));
    }

    private function validCorsHeaders(): bool
    {
        $headers = collect(config('cors.allowed_headers', []))
            ->map(fn (mixed $header): string => strtolower(trim((string) $header)));

        return ! $headers->contains('*')
            && $headers->contains('authorization')
            && $headers->contains('idempotency-key')
            && $headers->contains('x-health-record-draft-id')
            && $headers->contains('x-akay-session')
            && config('cors.supports_credentials') === true;
    }

    private function validAuthenticationCookie(bool $production): bool
    {
        $cookie = config('auth_persistence.cookie', []);
        $sameSite = $cookie['same_site'] ?? null;
        $secure = ($cookie['secure'] ?? false) === true;

        return ($cookie['http_only'] ?? false) === true
            && ($cookie['path'] ?? null) === '/api/auth'
            && in_array($sameSite, ['lax', 'strict', 'none'], true)
            && ($sameSite !== 'none' || $secure)
            && (! $production || $secure);
    }

    private function validTokenExpiration(): bool
    {
        $expiration = (int) config('sanctum.expiration');

        return $expiration > 0
            && $expiration <= config('operations.deployment.maximum_token_expiration_minutes');
    }

    private function validTrustedHosts(bool $production): bool
    {
        $patterns = config('security.trusted_hosts', []);

        if (! is_array($patterns) || ($production && $patterns === [])) {
            return false;
        }

        foreach ($patterns as $pattern) {
            if (! is_string($pattern)
                || ! str_starts_with($pattern, '^')
                || ! str_ends_with($pattern, '$')
                || str_contains($pattern, '.*')) {
                return false;
            }
        }

        return true;
    }

    private function validTrustedProxies(): bool
    {
        $proxies = config('security.trusted_proxies', []);

        if (! is_array($proxies)) {
            return false;
        }

        return SecurityConfiguration::parseTrustedProxies(implode(',', $proxies)) === $proxies;
    }

    private function validHstsConfiguration(): bool
    {
        if (! config('security.hsts.enabled')) {
            return true;
        }

        return config('app.env') === 'production'
            && parse_url(config('app.url'), PHP_URL_SCHEME) === 'https'
            && (int) config('security.hsts.max_age') > 0;
    }

    private function schedulerRegistered(): bool
    {
        $commands = collect(app(Schedule::class)->events())
            ->pluck('command')
            ->filter()
            ->all();

        return collect($commands)->contains(
            fn (string $command) => str_contains($command, 'referrals:mark-no-show')
        ) && collect($commands)->contains(
            fn (string $command) => str_contains($command, 'sanctum:prune-expired')
        ) && collect($commands)->contains(
            fn (string $command) => str_contains($command, 'health-record-drafts:prune')
        );
    }

    private function logStorageWritable(): bool
    {
        $directory = storage_path('logs');

        return is_dir($directory) && is_writable($directory);
    }

    private function validLogging(bool $production): bool
    {
        if (! $production) {
            return true;
        }

        $channel = config('logging.default');
        $settings = config("logging.channels.{$channel}", []);
        $allowedLevels = ['warning', 'error', 'critical', 'alert', 'emergency'];

        return ($settings['driver'] ?? null) === 'daily'
            && in_array(strtolower((string) ($settings['level'] ?? '')), $allowedLevels, true)
            && (int) ($settings['days'] ?? 0) > 0;
    }

    private function cacheUsable(): bool
    {
        $key = 'akay-deployment-check:'.Str::uuid();

        Cache::put($key, 'ok', 10);
        $usable = Cache::get($key) === 'ok';
        Cache::forget($key);

        return $usable;
    }
}
