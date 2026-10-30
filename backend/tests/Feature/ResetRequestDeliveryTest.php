<?php

namespace Tests\Feature;

use App\Mail\PasswordResetApprovedMail;
use App\Models\AccountInvite;
use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\PasswordResetRequest;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ResetRequestDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();

        $rhu = RuralHealthUnit::create(['name' => 'Reset RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Reset BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->admin = User::create(['name' => 'MHO', 'email' => 'mho@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []]);
        Sanctum::actingAs($this->admin, ['*']);
    }

    private function makeUser(string $email, string $status = 'active'): User
    {
        return User::create([
            'name' => 'User '.$email, 'email' => $email, 'password' => 'password123',
            'role' => 'bhc', 'staff_role' => 'midwife', 'status' => $status,
            'barangay_health_center_id' => $this->bhc->id, 'permissions' => [],
        ]);
    }

    private function makeRequest(string $email, array $attributes = [], string $userStatus = 'active'): PasswordResetRequest
    {
        $user = $this->makeUser($email, $userStatus);

        return PasswordResetRequest::create([
            'user_id' => $user->id,
            'email' => $email,
            'status' => PasswordResetRequest::STATUS_PENDING,
            'requested_at' => now(),
            ...$attributes,
        ]);
    }

    private function approved(string $email, array $attributes = []): PasswordResetRequest
    {
        return $this->makeRequest($email, [
            'status' => PasswordResetRequest::STATUS_APPROVED,
            'approved_by' => $this->admin->id,
            'approved_at' => now(),
            'expires_at' => now()->addMinutes(30),
            'reset_token_hash' => hash('sha256', 'old-token'),
            'delivery' => PasswordResetRequest::DELIVERY_SENT,
            ...$attributes,
        ]);
    }

    private function tokenFrom(string $url): string
    {
        parse_str(parse_url($url, PHP_URL_QUERY), $query);

        return $query['token'];
    }

    public function test_an_approval_whose_email_fails_is_saved_as_failed(): void
    {
        $request = $this->makeRequest('fail@example.test');
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('smtp down'));

        $this->postJson("/api/password-reset-requests/{$request->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.delivery', 'failed')
            ->assertJsonPath('data.display_status', 'pending');

        $fresh = $request->fresh();
        $this->assertSame(PasswordResetRequest::STATUS_APPROVED, $fresh->status);
        $this->assertSame(PasswordResetRequest::DELIVERY_FAILED, $fresh->delivery);
    }

    public function test_a_successful_approval_is_saved_as_sent_and_in_progress(): void
    {
        $request = $this->makeRequest('ok@example.test');

        $this->postJson("/api/password-reset-requests/{$request->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.delivery', 'sent')
            ->assertJsonPath('data.display_status', 'in_progress');

        Mail::assertSent(PasswordResetApprovedMail::class, 1);

        $audit = AuditLog::where('action', 'password reset approved')->firstOrFail();
        $this->assertStringNotContainsString('ok@example.test', $audit->description);
    }

    public function test_resend_and_link_restart_the_60_minute_window(): void
    {
        $request = $this->approved('window@example.test');

        $this->postJson("/api/password-reset-requests/{$request->id}/resend")
            ->assertOk()
            ->assertJsonPath('data.delivery', 'sent');
        Mail::assertSent(PasswordResetApprovedMail::class, 1);

        $this->getJson('/api/auth/password-reset/verify?token=old-token')->assertUnprocessable();
        $this->assertEqualsWithDelta(60 * 60, now()->diffInSeconds($request->fresh()->expires_at, false), 5);
        $this->assertTrue(AuditLog::where('action', 'reset link resent')->exists());

        $request->forceFill(['reset_token_hash' => hash('sha256', 'second-token'), 'expires_at' => now()->addMinutes(5)])->save();

        $url = $this->postJson("/api/password-reset-requests/{$request->id}/link")
            ->assertOk()
            ->json('data.url');

        $this->getJson('/api/auth/password-reset/verify?token=second-token')->assertUnprocessable();
        $this->getJson('/api/auth/password-reset/verify?token='.$this->tokenFrom($url))->assertOk();
        $this->assertSame(PasswordResetRequest::DELIVERY_COPIED, $request->fresh()->delivery);
        $this->assertEqualsWithDelta(60 * 60, now()->diffInSeconds($request->fresh()->expires_at, false), 5);
        Mail::assertSent(PasswordResetApprovedMail::class, 1);

        $log = AuditLog::where('action', 'reset link copied')->firstOrFail();
        $this->assertStringNotContainsString($this->tokenFrom($url), $log->description);
        $this->assertStringNotContainsString('window@example.test', $log->description);
    }

    public function test_a_failed_resend_is_recorded_without_an_error(): void
    {
        $request = $this->approved('refail@example.test');
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('smtp down'));

        $this->postJson("/api/password-reset-requests/{$request->id}/resend")
            ->assertOk()
            ->assertJsonPath('data.delivery', 'failed');
    }

    public function test_resend_and_link_work_for_expired_requests_and_refuse_pending_completed_rejected(): void
    {
        $expired = $this->makeRequest('expired@example.test', [
            'status' => PasswordResetRequest::STATUS_EXPIRED,
            'expires_at' => now()->subHour(),
        ]);

        $this->postJson("/api/password-reset-requests/{$expired->id}/resend")->assertOk();
        $this->assertSame(PasswordResetRequest::STATUS_APPROVED, $expired->fresh()->status);
        $this->postJson("/api/password-reset-requests/{$expired->id}/link")->assertOk();

        $refused = [
            $this->makeRequest('pending@example.test'),
            $this->makeRequest('completed@example.test', ['status' => PasswordResetRequest::STATUS_COMPLETED, 'completed_at' => now()]),
            $this->makeRequest('rejected@example.test', ['status' => PasswordResetRequest::STATUS_REJECTED, 'rejected_at' => now()]),
        ];
        foreach ($refused as $request) {
            $this->postJson("/api/password-reset-requests/{$request->id}/resend")->assertUnprocessable();
            $this->postJson("/api/password-reset-requests/{$request->id}/link")->assertUnprocessable();
        }

        $inactive = $this->approved('inactive@example.test');
        $inactive->user->forceFill(['status' => 'inactive'])->save();
        $this->postJson("/api/password-reset-requests/{$inactive->id}/resend")->assertUnprocessable();
        $this->postJson("/api/password-reset-requests/{$inactive->id}/link")->assertUnprocessable();
    }

    public function test_completing_a_reset_completes_an_open_invite_via_reset(): void
    {
        $request = $this->approved('both@example.test', ['reset_token_hash' => hash('sha256', 'live-token')]);
        $invite = AccountInvite::create([
            'user_id' => $request->user_id,
            'email' => 'both@example.test',
            'status' => AccountInvite::STATUS_PENDING,
            'delivery' => AccountInvite::DELIVERY_SENT,
            'token_hash' => hash('sha256', 'invite-token'),
            'expires_at' => now()->addHours(10),
        ]);

        $this->postJson('/api/auth/password-reset/complete', [
            'token' => 'live-token',
            'password' => 'NewPassw0rd',
            'password_confirmation' => 'NewPassw0rd',
        ])->assertOk();

        $request = $request->fresh();
        $this->assertSame(PasswordResetRequest::STATUS_COMPLETED, $request->status);
        $this->assertSame(PasswordResetRequest::VIA_LINK, $request->completed_via);
        $this->assertNotNull($request->completed_at);
        $this->assertNull($request->reset_token_hash);

        $invite = $invite->fresh();
        $this->assertSame(AccountInvite::STATUS_COMPLETED, $invite->status);
        $this->assertSame(AccountInvite::VIA_RESET, $invite->completed_via);

        $this->getJson('/api/auth/password-reset/verify?token[]=x')
            ->assertUnprocessable()
            ->assertJsonPath('message', 'This password reset link is invalid or expired.');

        $audit = AuditLog::where('action', 'password reset completed')->firstOrFail();
        $this->assertStringNotContainsString('both@example.test', $audit->description);
    }

    public function test_reset_completion_cannot_activate_an_unverified_account(): void
    {
        $request = $this->approved('pending-setup@example.test', ['reset_token_hash' => hash('sha256', 'unverified-token')]);
        $request->user->forceFill(['email_verified_at' => null])->save();
        $originalPassword = $request->user->password;

        $this->postJson('/api/auth/password-reset/complete', [
            'token' => 'unverified-token',
            'password' => 'NewPassw0rd',
            'password_confirmation' => 'NewPassw0rd',
        ])->assertUnprocessable();

        $this->getJson('/api/auth/password-reset/verify?token=unverified-token')->assertUnprocessable();

        $fresh = $request->user->fresh();
        $this->assertNull($fresh->email_verified_at);
        $this->assertSame($originalPassword, $fresh->password);
        $this->assertSame(PasswordResetRequest::STATUS_APPROVED, $request->fresh()->status);
    }

    public function test_status_filter_and_staff_role(): void
    {
        $pending = $this->makeRequest('p@example.test');
        $failed = $this->approved('f@example.test', ['delivery' => PasswordResetRequest::DELIVERY_FAILED]);
        $expired = $this->makeRequest('e@example.test', ['status' => PasswordResetRequest::STATUS_EXPIRED, 'expires_at' => now()->subHour()]);
        $sent = $this->approved('s@example.test');
        $legacy = $this->approved('l@example.test', ['delivery' => null]);
        $done = $this->makeRequest('d@example.test', ['status' => PasswordResetRequest::STATUS_COMPLETED, 'completed_via' => PasswordResetRequest::VIA_LINK]);
        $rejected = $this->makeRequest('r@example.test', ['status' => PasswordResetRequest::STATUS_REJECTED]);
        $inactive = $this->makeRequest('i@example.test', [], 'inactive');

        $ids = fn (string $status) => collect($this->getJson("/api/password-reset-requests?status={$status}")->assertOk()->json('data.data'))
            ->pluck('id')->sort()->values()->all();
        $sorted = fn (array $requests) => collect($requests)->pluck('id')->sort()->values()->all();

        $this->assertSame($sorted([$pending, $failed, $expired]), $ids('pending'));
        $this->assertSame($sorted([$sent, $legacy]), $ids('in_progress'));
        $this->assertSame($sorted([$done]), $ids('complete'));
        $this->assertSame($sorted([$rejected, $inactive]), $ids('cancelled'));
        $this->assertCount(8, $this->getJson('/api/password-reset-requests?status=bogus')->json('data.data'));

        $row = collect($this->getJson('/api/password-reset-requests?status=complete')->json('data.data'))->first();
        $this->assertSame('completed', $row['status']);
        $this->assertSame('complete', $row['display_status']);
        $this->assertSame('link', $row['completed_via']);
        $this->assertSame('midwife', $row['user']['staff_role']);

        $this->getJson("/api/password-reset-requests/{$sent->id}")
            ->assertJsonPath('data.delivery', 'sent')
            ->assertJsonPath('data.display_status', 'in_progress');
    }
}
