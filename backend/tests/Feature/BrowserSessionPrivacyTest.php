<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class BrowserSessionPrivacyTest extends TestCase
{
    use RefreshDatabase;

    private User $bhw;

    protected function setUp(): void
    {
        parent::setUp();

        $bhc = BarangayHealthCenter::create([
            'name' => 'Privacy Test BHC',
            'status' => 'active',
        ]);

        $this->bhw = User::create([
            'name' => 'Privacy Test BHW',
            'email' => 'privacy-bhw@example.test',
            'password' => bcrypt('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);
    }

    public function test_patient_responses_disable_browser_and_proxy_caching(): void
    {
        $this->assertSensitiveNoStoreHeaders(
            $this->actingAs($this->bhw, 'sanctum')->getJson('/api/patients')
        );
    }

    public function test_login_token_response_disables_browser_and_proxy_caching(): void
    {
        $this->assertSensitiveNoStoreHeaders(
            $this->postJson('/api/auth/login', [
                'email' => $this->bhw->email,
                'password' => 'password123',
            ])
        );
    }

    public function test_health_record_responses_disable_browser_and_proxy_caching(): void
    {
        $this->assertSensitiveNoStoreHeaders(
            $this->actingAs($this->bhw, 'sanctum')->getJson('/api/health-records')
        );
    }

    public function test_referral_responses_disable_browser_and_proxy_caching(): void
    {
        $this->assertSensitiveNoStoreHeaders(
            $this->actingAs($this->bhw, 'sanctum')->getJson('/api/referrals')
        );
    }

    public function test_notification_responses_disable_browser_and_proxy_caching(): void
    {
        $this->assertSensitiveNoStoreHeaders(
            $this->actingAs($this->bhw, 'sanctum')->getJson('/api/notifications')
        );
    }

    public function test_report_source_responses_disable_browser_and_proxy_caching(): void
    {
        $this->assertSensitiveNoStoreHeaders(
            $this->actingAs($this->bhw, 'sanctum')->getJson('/api/reports/bhw')
        );
    }

    private function assertSensitiveNoStoreHeaders(TestResponse $response): void
    {
        $response->assertOk();
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
}
