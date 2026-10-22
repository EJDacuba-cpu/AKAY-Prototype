<?php

namespace Tests;

use App\Models\RhuProvider;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\TurnstileVerifier;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Throwable;

abstract class TestCase extends BaseTestCase
{
    public const TEST_TURNSTILE_TOKEN = TurnstileVerifier::DUMMY_TOKEN;

    /**
     * @var array{body: mixed, status: int}|Throwable|'success'
     */
    protected mixed $turnstileFake = 'success';

    protected function setUp(): void
    {
        parent::setUp();
        $this->fakeSuccessfulTurnstileVerification();
    }

    protected function fakeSuccessfulTurnstileVerification(): void
    {
        $this->turnstileFake = 'success';
        Http::preventStrayRequests();
        Http::fake(function ($request) {
            if (! str_starts_with((string) $request->url(), TurnstileVerifier::SITEVERIFY_URL)) {
                return null;
            }

            if ($this->turnstileFake instanceof Throwable) {
                throw $this->turnstileFake;
            }

            if (is_array($this->turnstileFake)) {
                return Http::response($this->turnstileFake['body'], $this->turnstileFake['status']);
            }

            return Http::response([
                'success' => true,
                'challenge_ts' => now()->toIso8601String(),
                'hostname' => 'localhost',
                'action' => 'login',
                'error-codes' => [],
            ], 200);
        });
    }

    /**
     * @param  array<string, mixed>|string  $body
     */
    protected function fakeTurnstileResponse(mixed $body, int $status = 200): void
    {
        $this->turnstileFake = ['body' => $body, 'status' => $status];
    }

    protected function fakeUnreachableTurnstile(): void
    {
        $this->turnstileFake = new ConnectionException('connection refused');
    }

    /**
     * @param  array<string, mixed>  $credentials
     * @return array<string, mixed>
     */
    protected function withTurnstile(array $credentials): array
    {
        return array_merge([
            'turnstile_token' => self::TEST_TURNSTILE_TOKEN,
        ], $credentials);
    }

    /**
     * Seed one official available provider for a receiving RHU.
     *
     * DOC-14 blocks referral submission whenever the receiving RHU has zero
     * available official doctors, so any test that creates a referral over HTTP
     * must establish availability first. Tests that specifically exercise the
     * block deliberately do NOT call this.
     */
    protected function seedAvailableProvider(
        RuralHealthUnit|int $rhu,
        string $name = 'Dr. Available',
        string $status = RhuProvider::STATUS_AVAILABLE
    ): RhuProvider {
        $rhuId = $rhu instanceof RuralHealthUnit ? $rhu->id : $rhu;
        $slug = strtolower((string) preg_replace('/[^a-z0-9]+/i', '.', $name));
        $user = User::create([
            'name' => $name,
            'email' => $slug.'.'.$rhuId.'.'.str_replace('.', '', uniqid('', true)).'@example.test',
            'password' => 'password123',
            'role' => User::ROLE_RHU,
            'staff_role' => 'doctor',
            'status' => User::STATUS_ACTIVE,
            'rural_health_unit_id' => $rhuId,
        ]);

        return RhuProvider::create([
            'rural_health_unit_id' => $rhuId,
            'user_id' => $user->id,
            'name' => $name,
            'specialization' => 'General Practitioner',
            'availability_status' => $status,
            'availability_status_set_at' => now(),
            'is_active' => true,
        ]);
    }
}
