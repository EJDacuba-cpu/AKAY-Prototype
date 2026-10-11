<?php

namespace Tests\Feature;

use App\Models\AccountInvite;
use App\Models\PasswordResetRequest;
use App\Models\User;
use App\Services\PasswordSetRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PasswordSetRecorderTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::create(['name' => 'Nurse', 'email' => 'nurse@example.test', 'password' => 'password123', 'role' => 'bhc', 'status' => 'active', 'permissions' => []]);
    }

    private function invite(string $status): AccountInvite
    {
        return AccountInvite::create([
            'user_id' => $this->user->id,
            'email' => $this->user->email,
            'token_hash' => hash('sha256', 'invite-token'),
            'status' => $status,
            'delivery' => AccountInvite::DELIVERY_SENT,
            'expires_at' => now()->addHours(48),
            'sent_at' => now(),
        ]);
    }

    private function reset(string $status, array $extra = []): PasswordResetRequest
    {
        return PasswordResetRequest::create(array_merge([
            'user_id' => $this->user->id,
            'email' => $this->user->email,
            'status' => $status,
            'requested_at' => now()->subHour(),
            'reset_token_hash' => hash('sha256', 'reset-token'),
            'expires_at' => now()->addMinutes(60),
        ], $extra));
    }

    public function test_an_invite_link_completes_the_invite_and_open_reset_requests(): void
    {
        $invite = $this->invite(AccountInvite::STATUS_PENDING);
        $reset = $this->reset(PasswordResetRequest::STATUS_APPROVED);

        app(PasswordSetRecorder::class)->record($this->user, 'invite');

        $invite->refresh();
        $this->assertSame(AccountInvite::STATUS_COMPLETED, $invite->status);
        $this->assertSame('link', $invite->completed_via);
        $this->assertNull($invite->token_hash);
        $this->assertNotNull($invite->completed_at);

        $reset->refresh();
        $this->assertSame(PasswordResetRequest::STATUS_COMPLETED, $reset->status);
        $this->assertSame('invite', $reset->completed_via);
        $this->assertNull($reset->reset_token_hash);
        $this->assertNull($reset->expires_at);
        $this->assertNotNull($reset->completed_at);
    }

    public function test_a_reset_completes_an_open_invite_via_reset(): void
    {
        $invite = $this->invite(AccountInvite::STATUS_EXPIRED);
        $reset = $this->reset(PasswordResetRequest::STATUS_APPROVED);

        app(PasswordSetRecorder::class)->record($this->user, 'reset');

        $this->assertSame(AccountInvite::STATUS_COMPLETED, $invite->fresh()->status);
        $this->assertSame('reset', $invite->fresh()->completed_via);
        $this->assertSame(PasswordResetRequest::STATUS_COMPLETED, $reset->fresh()->status);
        $this->assertSame('link', $reset->fresh()->completed_via);
    }

    public function test_a_temporary_password_change_completes_both_via_temporary_password(): void
    {
        $invite = $this->invite(AccountInvite::STATUS_TEMPORARY);
        $reset = $this->reset(PasswordResetRequest::STATUS_PENDING, ['reset_token_hash' => null, 'expires_at' => null]);

        app(PasswordSetRecorder::class)->record($this->user, 'temporary_password');

        $this->assertSame(AccountInvite::STATUS_COMPLETED, $invite->fresh()->status);
        $this->assertSame('temporary_password', $invite->fresh()->completed_via);
        $this->assertSame(PasswordResetRequest::STATUS_COMPLETED, $reset->fresh()->status);
        $this->assertSame('temporary_password', $reset->fresh()->completed_via);
    }

    public function test_finished_items_are_left_alone(): void
    {
        $this->invite(AccountInvite::STATUS_PENDING);
        $rejected = $this->reset(PasswordResetRequest::STATUS_REJECTED, ['reset_token_hash' => null, 'expires_at' => null]);
        $older = $this->reset(PasswordResetRequest::STATUS_COMPLETED, [
            'completed_via' => 'link',
            'completed_at' => now()->subDay(),
            'reset_token_hash' => null,
            'expires_at' => null,
        ]);
        $olderCompletedAt = $older->fresh()->completed_at;

        app(PasswordSetRecorder::class)->record($this->user, 'invite');

        $this->assertSame(PasswordResetRequest::STATUS_REJECTED, $rejected->fresh()->status);
        $this->assertNull($rejected->fresh()->completed_via);
        $this->assertSame(PasswordResetRequest::STATUS_COMPLETED, $older->fresh()->status);
        $this->assertSame('link', $older->fresh()->completed_via);
        $this->assertTrue($olderCompletedAt->equalTo($older->fresh()->completed_at));
    }
}
