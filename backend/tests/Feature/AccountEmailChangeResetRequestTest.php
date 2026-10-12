<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\PasswordResetRequest;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Fixing an account's email in Users must not leave an open reset request pointing at the old address. */
class AccountEmailChangeResetRequestTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();

        $rhu = RuralHealthUnit::create(['name' => 'Reset RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Reset BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $admin = User::create(['name' => 'MHO', 'email' => 'mho@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []]);
        $this->user = User::create([
            'name' => 'Nurse', 'email' => 'old@example.test', 'password' => bin2hex(random_bytes(16)),
            'contact_number' => '09170000000', 'role' => 'bhc', 'staff_role' => 'midwife', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'permissions' => [],
        ]);
        Sanctum::actingAs($admin, ['*']);
    }

    private function makeRequest(array $attributes = []): PasswordResetRequest
    {
        return PasswordResetRequest::create([
            'user_id' => $this->user->id, 'email' => 'old@example.test',
            'status' => PasswordResetRequest::STATUS_PENDING, 'requested_at' => now(),
            ...$attributes,
        ]);
    }

    public function test_a_pending_request_follows_the_new_email(): void
    {
        $request = $this->makeRequest();

        $this->patchJson("/api/users/{$this->user->id}", ['email' => 'new@example.test'])->assertOk();

        $request->refresh();
        $this->assertSame('new@example.test', $request->email);
        $this->assertSame(PasswordResetRequest::STATUS_PENDING, $request->status);
    }

    public function test_an_approved_request_loses_its_link_and_follows_the_new_email(): void
    {
        $request = $this->makeRequest([
            'status' => PasswordResetRequest::STATUS_APPROVED,
            'delivery' => PasswordResetRequest::DELIVERY_SENT,
            'reset_token_hash' => hash('sha256', 'old-token'),
            'expires_at' => now()->addMinutes(30),
        ]);

        $this->patchJson("/api/users/{$this->user->id}", ['email' => 'new@example.test'])->assertOk();

        $request->refresh();
        $this->assertSame('new@example.test', $request->email);
        $this->assertNull($request->reset_token_hash);
        $this->assertSame(PasswordResetRequest::STATUS_EXPIRED, $request->status);
    }

    public function test_closed_requests_keep_the_address_they_were_made_with(): void
    {
        $completed = $this->makeRequest(['status' => PasswordResetRequest::STATUS_COMPLETED]);
        $rejected = $this->makeRequest(['status' => PasswordResetRequest::STATUS_REJECTED]);

        $this->patchJson("/api/users/{$this->user->id}", ['email' => 'new@example.test'])->assertOk();

        $this->assertSame('old@example.test', $completed->fresh()->email);
        $this->assertSame('old@example.test', $rejected->fresh()->email);
    }

    public function test_a_change_that_leaves_the_email_alone_keeps_an_approved_link(): void
    {
        $request = $this->makeRequest([
            'status' => PasswordResetRequest::STATUS_APPROVED,
            'reset_token_hash' => hash('sha256', 'old-token'),
            'expires_at' => now()->addMinutes(30),
        ]);

        $this->patchJson("/api/users/{$this->user->id}", ['name' => 'Renamed Nurse'])->assertOk();

        $request->refresh();
        $this->assertSame('old@example.test', $request->email);
        $this->assertNotNull($request->reset_token_hash);
        $this->assertSame(PasswordResetRequest::STATUS_APPROVED, $request->status);
    }
}
