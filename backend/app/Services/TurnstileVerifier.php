<?php

namespace App\Services;

use App\Exceptions\TurnstileVerificationException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class TurnstileVerifier
{
    public const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    public const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

    public const DUMMY_SITE_KEYS = [
        '1x00000000000000000000AA',
        '2x00000000000000000000AB',
        '1x00000000000000000000BB',
        '2x00000000000000000000BB',
        '3x00000000000000000000FF',
    ];

    public const DUMMY_SECRET_KEYS = [
        '1x0000000000000000000000000000000AA',
        '2x0000000000000000000000000000000AA',
        '3x0000000000000000000000000000000AA',
    ];

    public function verify(string $token, ?string $remoteIp = null): void
    {
        $token = trim($token);

        if ($token === '' || strlen($token) > 2048) {
            throw TurnstileVerificationException::failed();
        }

        $siteKey = (string) config('services.turnstile.site_key');
        $secret = (string) config('services.turnstile.secret');
        $usingTestingCredentials = $this->isTestingSiteKey($siteKey) || $this->isTestingSecret($secret);

        if ($siteKey === '' || $secret === '') {
            $this->logFailure('Turnstile is not configured.');
            throw TurnstileVerificationException::unavailable();
        }

        if ($usingTestingCredentials && ! $this->testingCredentialsAllowed()) {
            $this->logFailure('Turnstile testing credentials are not allowed in this environment.');
            throw TurnstileVerificationException::unavailable();
        }

        if ($token === self::DUMMY_TOKEN && ! $this->testingCredentialsAllowed()) {
            throw TurnstileVerificationException::failed();
        }

        $payload = $this->siteverify($token, $remoteIp, $secret);
        $errorCodes = $this->errorCodes($payload);

        if (! ($payload['success'] ?? false)) {
            if ($this->isServiceError($errorCodes)) {
                $this->logFailure('Turnstile siteverify returned an internal error.', $errorCodes);
                throw TurnstileVerificationException::unavailable();
            }

            throw TurnstileVerificationException::failed(
                in_array('timeout-or-duplicate', $errorCodes, true)
                    ? 'This bot check has expired or was already used. Refresh the check and try again.'
                    : null
            );
        }

        if ($usingTestingCredentials) {
            return;
        }

        $expectedAction = (string) config('services.turnstile.action', 'login');
        $action = trim((string) ($payload['action'] ?? ''));
        if ($expectedAction !== '' && $action !== '' && $action !== $expectedAction) {
            $this->logFailure('Turnstile action did not match the login widget.');
            throw TurnstileVerificationException::failed();
        }

        $hostname = strtolower(trim((string) ($payload['hostname'] ?? '')));
        $expectedHostnames = $this->expectedHostnames();
        if ($hostname !== '' && $expectedHostnames !== [] && ! in_array($hostname, $expectedHostnames, true)) {
            $this->logFailure('Turnstile hostname did not match the configured frontend.');
            throw TurnstileVerificationException::failed();
        }
    }

    public function testingCredentialsAllowed(): bool
    {
        return app()->environment(['local', 'testing']);
    }

    public function isTestingSiteKey(string $siteKey): bool
    {
        return in_array($siteKey, self::DUMMY_SITE_KEYS, true);
    }

    public function isTestingSecret(string $secret): bool
    {
        return in_array($secret, self::DUMMY_SECRET_KEYS, true);
    }

    /**
     * @return array<string, mixed>
     */
    private function siteverify(string $token, ?string $remoteIp, string $secret): array
    {
        $url = (string) config('services.turnstile.url', self::SITEVERIFY_URL);
        $timeout = max(1, (int) config('services.turnstile.timeout', 5));
        $idempotencyKey = (string) Str::uuid();
        $body = [
            'secret' => $secret,
            'response' => $token,
            'idempotency_key' => $idempotencyKey,
        ];

        if (is_string($remoteIp) && $remoteIp !== '') {
            $body['remoteip'] = $remoteIp;
        }

        $lastError = null;

        for ($attempt = 1; $attempt <= 2; $attempt++) {
            try {
                $response = Http::asForm()
                    ->acceptJson()
                    ->timeout($timeout)
                    ->connectTimeout(min(3, $timeout))
                    ->withOptions($this->httpOptions())
                    ->post($url, $body);

                if ($response->serverError() && $attempt < 2) {
                    $lastError = 'http-'.$response->status();

                    continue;
                }

                $payload = $response->json();
                if (! is_array($payload)) {
                    $this->logFailure('Turnstile siteverify returned a non-JSON response.');
                    throw TurnstileVerificationException::unavailable();
                }

                return $payload;
            } catch (TurnstileVerificationException $exception) {
                throw $exception;
            } catch (ConnectionException $exception) {
                $lastError = $exception::class;
                if ($attempt === 2) {
                    break;
                }
            } catch (\Throwable $exception) {
                $this->logFailure('Turnstile siteverify failed.', [], $exception::class);
                throw TurnstileVerificationException::unavailable();
            }
        }

        $this->logFailure('Turnstile siteverify was unreachable.', [], $lastError);
        throw TurnstileVerificationException::unavailable();
    }

    /**
     * @return array<string, mixed>
     */
    private function httpOptions(): array
    {
        $options = ['http_errors' => false];
        $bundle = $this->caBundle();

        if ($bundle !== null) {
            $options['verify'] = $bundle;
        }

        return $options;
    }

    private function caBundle(): ?string
    {
        $configured = trim((string) config('services.turnstile.ca_bundle'));
        if ($configured !== '' && is_readable($configured)) {
            return $configured;
        }

        foreach ([(string) ini_get('curl.cainfo'), (string) ini_get('openssl.cafile')] as $iniBundle) {
            $iniBundle = trim($iniBundle);
            if ($iniBundle !== '' && is_readable($iniBundle)) {
                return $iniBundle;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return list<string>
     */
    private function errorCodes(array $payload): array
    {
        $codes = $payload['error-codes'] ?? $payload['error_codes'] ?? [];

        if (! is_array($codes)) {
            return [];
        }

        return array_values(array_filter($codes, fn ($code) => is_string($code) && $code !== ''));
    }

    /**
     * @param  list<string>  $errorCodes
     */
    private function isServiceError(array $errorCodes): bool
    {
        return in_array('internal-error', $errorCodes, true)
            || in_array('missing-input-secret', $errorCodes, true)
            || in_array('invalid-input-secret', $errorCodes, true);
    }

    /**
     * @return list<string>
     */
    private function expectedHostnames(): array
    {
        $hosts = config('services.turnstile.expected_hostnames', []);

        if (! is_array($hosts)) {
            return [];
        }

        return array_values(array_unique(array_filter(array_map(
            fn ($host) => is_string($host) ? strtolower(trim($host)) : '',
            $hosts
        ))));
    }

    /**
     * @param  list<string>  $errorCodes
     */
    private function logFailure(string $message, array $errorCodes = [], ?string $exceptionType = null): void
    {
        Log::warning($message, array_filter([
            'error_codes' => $errorCodes ?: null,
            'exception_type' => $exceptionType,
        ]));
    }
}
