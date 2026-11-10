<?php

namespace Tests\Feature;

use Tests\TestCase;

class RegistrationCorsTest extends TestCase
{
    private const ORIGIN = 'https://registration.example.test';

    protected function setUp(): void
    {
        parent::setUp();
        // Keep the real header allowlist: overriding it would hide config drift.
        config()->set([
            'cors.allowed_origins' => [self::ORIGIN],
            'cors.allowed_origins_patterns' => [],
        ]);
    }

    public function test_cross_origin_registration_allows_every_draft_commit_header(): void
    {
        $this->assertPreflight('/api/patients', 'POST', [
            'authorization', 'content-type', 'x-working-facility',
            'x-form-draft-id', 'x-form-draft-version', 'x-form-draft-transaction',
        ]);
    }

    public function test_household_lookup_preflight_needs_no_commit_headers(): void
    {
        foreach (['bhc', 'rhu'] as $role) {
            $this->assertPreflight('/api/'.$role.'/households/lookup', 'GET', [
                'authorization', 'content-type', 'x-working-facility',
            ]);
        }
    }

    public function test_untrusted_origin_is_not_allowed_to_commit_registration(): void
    {
        $response = $this->options('/api/patients', [], [
            'Origin' => 'https://untrusted.example.test',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'x-form-draft-id',
        ]);
        $this->assertNotSame('https://untrusted.example.test', $response->headers->get('Access-Control-Allow-Origin'));
        $this->assertNotSame('*', $response->headers->get('Access-Control-Allow-Origin'));
        $this->assertNotContains('*', config('cors.allowed_headers'));
    }

    private function assertPreflight(string $path, string $method, array $headers): void
    {
        $response = $this->options($path, [], [
            'Origin' => self::ORIGIN,
            'Access-Control-Request-Method' => $method,
            'Access-Control-Request-Headers' => implode(', ', $headers),
        ]);
        $response->assertSuccessful()->assertHeader('Access-Control-Allow-Origin', self::ORIGIN);
        $allowed = array_map('trim', explode(',', strtolower((string) $response->headers->get('Access-Control-Allow-Headers'))));
        foreach ($headers as $header) {
            $this->assertContains($header, $allowed, 'Browser preflight would block '.$header);
        }
    }
}
