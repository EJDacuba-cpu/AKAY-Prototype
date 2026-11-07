<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\PasswordResetRequest;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\AccountActivationService;
use App\Services\AccountInviteService;
use App\Services\PasswordSetRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminActionNotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $secondAdmin;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $bhc = BarangayHealthCenter::create(['name' => 'Action BHC', 'status' => 'active']);
        $this->admin = $this->account('admin');
        $this->secondAdmin = $this->account('admin');
        $this->staff = $this->account('bhc', ['staff_role' => 'midwife', 'barangay_health_center_id' => $bhc->id]);
        Sanctum::actingAs($this->admin, ['*']);
    }

    private function account(string $role, array $attributes = []): User
    {
        return User::create([
            'name' => 'Action User', 'email' => uniqid('action-', true).'@example.test',
            'password' => 'password123', 'role' => $role, 'status' => 'active', ...$attributes,
        ]);
    }

    private function requestReset(): PasswordResetRequest
    {
        $this->postJson('/api/auth/password-reset/request', ['email' => $this->staff->email])->assertOk();

        return PasswordResetRequest::where('user_id', $this->staff->id)->latest('id')->firstOrFail();
    }

    private function alerts(string $type = 'password_reset_request')
    {
        return UserNotification::where('type', $type);
    }

    private function assertResolved(string $type = 'password_reset_request'): void
    {
        $this->assertSame(0, $this->alerts($type)->whereNull('cleared_at')->count());
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'data.data');
        $this->getJson('/api/notifications/counts')->assertJsonPath('data.unread', 0);
    }

    public function test_reset_reuses_pending_request_and_only_notifies_active_admins(): void
    {
        $this->account('admin', ['status' => 'inactive']);
        $this->account('rhu');
        $reset = $this->requestReset();
        $this->requestReset();
        $this->assertDatabaseCount('password_reset_requests', 1);
        $this->assertSame([$this->admin->id, $this->secondAdmin->id], $this->alerts()->orderBy('user_id')->pluck('user_id')->all());
        $this->assertSame((string) $reset->id, (string) $this->alerts()->first()->entity_id);
        $this->assertSame('/admin/password-reset-requests', $this->alerts()->first()->link_url);
    }

    public function test_ineligible_and_unknown_reset_requests_do_not_notify(): void
    {
        $unverified = $this->account('bhc');
        $unverified->forceFill(['email_verified_at' => null])->save();
        foreach (['missing@example.test', $this->account('bhc', ['status' => 'inactive'])->email,
            $unverified->email] as $email) {
            $this->postJson('/api/auth/password-reset/request', ['email' => $email])->assertOk();
        }
        $this->assertDatabaseCount('password_reset_requests', 0);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_successful_reset_delivery_resolves_every_admin_copy(): void
    {
        $reset = $this->requestReset();
        $this->postJson("/api/password-reset-requests/{$reset->id}/approve")->assertOk();
        $this->assertResolved();
    }

    public function test_failed_reset_delivery_stays_actionable_until_link_is_copied(): void
    {
        $reset = $this->requestReset();
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('mailer unavailable'));
        $this->postJson("/api/password-reset-requests/{$reset->id}/approve")->assertOk();
        $this->assertSame(2, $this->alerts()->whereNull('cleared_at')->count());
        $this->assertStringContainsString('Resend', $this->alerts()->first()->message);
        $this->getJson('/api/notifications')->assertJsonCount(1, 'data.data');
        $this->postJson("/api/password-reset-requests/{$reset->id}/link")->assertOk();
        $this->assertResolved();
    }

    public function test_rejection_and_password_completion_resolve_all_open_reset_alerts(): void
    {
        $reset = $this->requestReset();
        $this->postJson("/api/password-reset-requests/{$reset->id}/reject")->assertOk();
        $this->assertResolved();
        $this->requestReset();
        app(PasswordSetRecorder::class)->record($this->staff, PasswordSetRecorder::ROUTE_TEMPORARY_PASSWORD);
        $this->assertResolved();
    }

    public function test_failed_invitation_notifies_active_admins_and_successful_send_does_not(): void
    {
        $this->account('admin', ['status' => 'inactive']);
        app(AccountInviteService::class)->issue($this->staff, $this->admin);
        $this->assertSame(0, $this->alerts('account_invite_delivery_failed')->count());
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('mailer unavailable'));
        $invite = app(AccountInviteService::class)->issue($this->staff, $this->admin);
        $alerts = $this->alerts('account_invite_delivery_failed');
        $this->assertSame([$this->admin->id, $this->secondAdmin->id], $alerts->orderBy('user_id')->pluck('user_id')->all());
        $this->assertSame('/admin/account-invites', $alerts->first()->link_url);
        $this->assertSame('account_invite', $alerts->first()->entity_type);
        $this->assertSame((string) $invite->id, (string) $alerts->first()->entity_id);
    }

    public function test_repeated_invitation_failure_preserves_dismissal_but_a_new_failure_reopens_unread(): void
    {
        $successfulMailer = Mail::getFacadeRoot();
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('mailer unavailable'));
        $invites = app(AccountInviteService::class);
        $invite = $invites->issue($this->staff, $this->admin);
        $this->alerts('account_invite_delivery_failed')->update(['is_read' => true, 'trashed_at' => now()]);
        $invites->resend($invite);
        $this->assertSame(2, $this->alerts('account_invite_delivery_failed')->count());
        $this->assertSame(2, $this->alerts('account_invite_delivery_failed')->whereNotNull('trashed_at')->count());
        Mail::swap($successfulMailer);
        $invites->resend($invite);
        $this->assertResolved('account_invite_delivery_failed');
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('mailer unavailable'));
        $invites->resend($invite);
        $this->assertSame(2, $this->alerts('account_invite_delivery_failed')->whereNull('cleared_at')->whereNull('trashed_at')->where('is_read', false)->count());
    }

    public function test_invite_completion_clears_failed_delivery_alerts(): void
    {
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('mailer unavailable'));
        app(AccountInviteService::class)->issue($this->staff, $this->admin);
        $this->assertSame(2, $this->alerts('account_invite_delivery_failed')->count());
        app(PasswordSetRecorder::class)->record($this->staff, PasswordSetRecorder::ROUTE_INVITE);
        $this->assertResolved('account_invite_delivery_failed');
    }

    public function test_deactivation_clears_both_admin_alert_types(): void
    {
        $this->requestReset();
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('mailer unavailable'));
        app(AccountInviteService::class)->issue($this->staff, $this->admin);
        $this->deleteJson("/api/users/{$this->staff->id}")->assertOk();
        $this->assertResolved();
        $this->assertResolved('account_invite_delivery_failed');
    }

    public function test_demoted_admin_cannot_read_or_mutate_retained_admin_alerts(): void
    {
        $this->requestReset();
        $alert = $this->alerts()->where('user_id', $this->admin->id)->firstOrFail();
        $this->admin->forceFill(['role' => 'bhc', 'staff_role' => 'midwife', 'barangay_health_center_id' => $this->staff->barangay_health_center_id])->save();
        Sanctum::actingAs($this->admin->fresh(), ['*']);
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'data.data');
        $this->getJson('/api/notifications/counts')->assertJsonPath('data.system', 0);
        $this->patchJson("/api/notifications/{$alert->id}/read")->assertForbidden();
        $this->postJson("/api/notifications/{$alert->id}/restore")->assertForbidden();
    }

    public function test_legacy_closed_reset_alert_is_hidden_without_read_side_effects(): void
    {
        $reset = $this->requestReset();
        $reset->update(['status' => 'rejected']);
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'data.data');
        $this->getJson('/api/notifications/counts')->assertJsonPath('data.unread', 0);
        $this->assertSame(2, $this->alerts()->whereNull('cleared_at')->count());
    }

    public function test_ordinary_admin_reads_never_create_expiry_or_invitation_alerts(): void
    {
        $invite = app(AccountInviteService::class)->issue($this->staff, $this->admin);
        $invite->update(['expires_at' => now()->subMinute()]);
        foreach (['/api/notifications', '/api/notifications/counts', '/api/account-invites', '/api/password-invites/summary', '/api/admin/dashboard'] as $url) {
            $this->getJson($url)->assertOk();
        }
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_failed_reset_resend_reopens_the_resolved_alert_and_successful_retry_resolves_it(): void
    {
        $successfulMailer = Mail::getFacadeRoot();
        $reset = $this->requestReset();
        $this->postJson("/api/password-reset-requests/{$reset->id}/approve")->assertOk();
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('mailer unavailable'));
        $this->postJson("/api/password-reset-requests/{$reset->id}/resend")->assertOk();
        $this->assertSame(2, $this->alerts()->whereNull('cleared_at')->where('is_read', false)->count());
        Mail::swap($successfulMailer);
        $this->postJson("/api/password-reset-requests/{$reset->id}/resend")->assertOk();
        $this->assertResolved();
        $reset->refresh()->update(['expires_at' => now()->subMinute()]);
        $this->getJson('/api/password-reset-requests')->assertOk();
        $this->assertResolved();
    }

    public function test_reading_an_alert_does_not_resolve_the_pending_admin_task(): void
    {
        $reset = $this->requestReset();
        $alert = $this->alerts()->where('user_id', $this->admin->id)->firstOrFail();
        $this->patchJson("/api/notifications/{$alert->id}/read")->assertOk();
        $this->assertSame('pending', $reset->fresh()->status);
        $this->assertNull($alert->fresh()->cleared_at);
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(1, 'data.data');
    }

    public function test_completed_and_orphaned_invite_alerts_are_hidden_from_inbox_and_trash(): void
    {
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('mailer unavailable'));
        $invite = app(AccountInviteService::class)->issue($this->staff, $this->admin);
        $alert = $this->alerts('account_invite_delivery_failed')->where('user_id', $this->admin->id)->firstOrFail();
        $alert->update(['trashed_at' => now()]);
        $invite->update(['status' => 'completed']);
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'data.data');
        $this->getJson('/api/notifications/trash')->assertOk()->assertJsonCount(0, 'data.data');
        $this->postJson("/api/notifications/{$alert->id}/restore")->assertForbidden();
        $invite->delete();
        $this->getJson('/api/notifications/counts')->assertJsonPath('data.system', 0)->assertJsonPath('data.trash', 0);
        $this->assertSame(2, $this->alerts('account_invite_delivery_failed')->count());
    }

    public function test_patch_deactivation_resolves_alerts_and_unverified_mailbox_change_hides_reset(): void
    {
        $this->requestReset();
        $this->patchJson("/api/users/{$this->staff->id}", ['status' => 'inactive'])->assertOk();
        $this->assertResolved();
        $this->staff->update(['status' => 'active']);
        $this->requestReset();
        app(AccountActivationService::class)->startOverForMailboxChange($this->staff);
        $this->assertResolved();
    }

    public function test_failure_to_a_corrected_invite_mailbox_is_a_new_unread_episode(): void
    {
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('mailer unavailable'));
        $invite = app(AccountInviteService::class)->issue($this->staff, $this->admin);
        $this->alerts('account_invite_delivery_failed')->update(['is_read' => true, 'trashed_at' => now()]);
        $this->patchJson("/api/account-invites/{$invite->id}/email", ['email' => 'corrected@example.test'])->assertOk();
        $this->assertSame(2, $this->alerts('account_invite_delivery_failed')
            ->whereNull('cleared_at')->whereNull('trashed_at')->where('is_read', false)->count());
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(1, 'data.data');
    }

    public function test_a_new_reset_submission_after_reactivation_has_a_visible_admin_alert(): void
    {
        $old = $this->requestReset();
        $this->patchJson("/api/users/{$this->staff->id}", ['status' => 'inactive'])->assertOk();
        $this->patchJson("/api/users/{$this->staff->id}", ['status' => 'active'])->assertOk();
        $current = $this->requestReset();
        $this->assertNotSame($old->id, $current->id);
        $this->assertSame('rejected', $old->fresh()->status);
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(1, 'data.data');
        $this->getJson('/api/notifications/counts')->assertJsonPath('data.unread', 1);
    }

    public function test_manual_clear_is_preserved_on_an_ordinary_repeat_reset_submission(): void
    {
        $reset = $this->requestReset();
        $this->alerts()->update(['cleared_at' => now(), 'is_read' => true]);
        $this->assertSame($reset->id, $this->requestReset()->id);
        $this->assertSame(0, $this->alerts()->whereNull('cleared_at')->count());
    }

    public function test_reactivation_restores_a_failed_invitation_that_needs_admin_action(): void
    {
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('mailer unavailable'));
        app(AccountInviteService::class)->issue($this->staff, $this->admin);
        $this->patchJson("/api/users/{$this->staff->id}", ['status' => 'inactive'])->assertOk();
        $this->patchJson("/api/users/{$this->staff->id}", ['status' => 'active'])->assertOk();
        $this->assertSame(2, $this->alerts('account_invite_delivery_failed')->whereNull('cleared_at')->where('is_read', false)->count());
    }

    public function test_completion_rechecks_a_rejected_reset_after_the_initial_lookup(): void
    {
        $this->assertStaleCompletionRefused(['status' => 'rejected', 'reset_token_hash' => null]);
    }

    public function test_completion_rechecks_a_rotated_reset_token_after_the_initial_lookup(): void
    {
        $this->assertStaleCompletionRefused(['reset_token_hash' => hash('sha256', 'new-token')]);
    }

    public function test_completion_rechecks_account_deactivation_after_the_initial_lookup(): void
    {
        $this->assertStaleCompletionRefused([], ['status' => 'inactive']);
    }

    private function assertStaleCompletionRefused(array $resetChange, array $accountChange = []): void
    {
        $reset = $this->requestReset();
        $reset->update(['status' => 'approved', 'reset_token_hash' => hash('sha256', 'stale-token'), 'expires_at' => now()->addHour()]);
        $oldPassword = $this->staff->password;
        $interleaved = false;
        // Change the persisted state after the initial SELECT has hydrated its old snapshot.
        User::retrieved(function (User $loaded) use (&$interleaved, $reset, $resetChange, $accountChange): void {
            if ($interleaved || $loaded->id !== $this->staff->id) {
                return;
            }
            $interleaved = true;
            if ($resetChange) {
                DB::table('password_reset_requests')->where('id', $reset->id)->update($resetChange);
            }
            if ($accountChange) {
                DB::table('users')->where('id', $loaded->id)->update($accountChange);
            }
        });
        $this->postJson('/api/auth/password-reset/complete', [
            'token' => 'stale-token', 'password' => 'Changedpass123', 'password_confirmation' => 'Changedpass123',
        ])->assertUnprocessable();
        $this->assertTrue($interleaved);
        $this->assertSame($oldPassword, $this->staff->fresh()->password);
    }
}
