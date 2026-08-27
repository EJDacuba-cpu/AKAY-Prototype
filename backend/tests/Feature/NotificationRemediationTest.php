<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\FollowUpNotificationService;
use App\Services\NotificationPruner;
use App\Services\UserNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Notification System Remediation - covers Decisions A1 (write-on-read),
 * B4 (dedup race), D-4/D-5/D-7/D-8 (counts, Trash, mark-unread, search),
 * and C3 (pruner). C2 (the partial index) has no behavioral test - it is
 * verified structurally, not through app behavior.
 */
class NotificationRemediationTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $bhw;

    private User $otherBhw;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $this->bhc = BarangayHealthCenter::create(['name' => 'Notif BHC', 'status' => 'active']);
        $this->bhw = $this->user('Notif BHW', 'notif-bhw@example.test', $this->bhc->id);
        $this->otherBhw = $this->user('Other Notif BHW', 'notif-bhw-2@example.test', $this->bhc->id);
        $this->patient = Patient::create([
            'first_name' => 'Notif',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }

    /** Decision A1: GET /notifications must never transition follow-up state. */
    public function test_index_does_not_mutate_overdue_follow_up_tasks(): void
    {
        $task = $this->overdueTask();

        $this->actingAs($this->bhw, 'sanctum')->getJson('/api/notifications')->assertOk();

        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $this->assertDatabaseCount('notifications', 0);
    }

    /** Decision A1: the sweep, not the read path, performs the transition and notifies. */
    public function test_sweep_transitions_overdue_tasks_and_notifies_the_owning_bhc(): void
    {
        $task = $this->overdueTask();

        $result = app(FollowUpNotificationService::class)->sweep();

        $this->assertSame(FollowUpTask::STATE_NO_SHOW, $task->fresh()->state);
        $this->assertSame(1, $result['transitioned']);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->bhw->id,
            'type' => 'follow_up_no_show',
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->otherBhw->id,
            'type' => 'follow_up_no_show',
        ]);
    }

    /** Decision A1 dry-run: counts without mutating. */
    public function test_sweep_dry_run_counts_without_changing_anything(): void
    {
        $task = $this->overdueTask();

        $result = app(FollowUpNotificationService::class)->sweep(dryRun: true);

        $this->assertSame(1, $result['transitioned']);
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $this->assertDatabaseCount('notifications', 0);
    }

    /** Decision B4: two calls with identical identity produce exactly one row, atomically. */
    public function test_notify_user_once_is_deduplicated_by_a_unique_dedup_key(): void
    {
        $service = app(UserNotificationService::class);

        $notify = fn () => $service->notifyUserOnce(
            $this->bhw,
            'Title',
            'Message',
            'follow_up_no_show',
            null,
            null,
            'follow_up_task_no_show_2026-08-27',
            42
        );

        $notify();
        $notify();

        $this->assertDatabaseCount('notifications', 1);
    }

    /** Decision B4: clearing a notification does not block a later, differently-bucketed one. */
    public function test_a_new_entity_bucket_is_not_blocked_by_a_cleared_earlier_one(): void
    {
        $service = app(UserNotificationService::class);

        $service->notifyUserOnce($this->bhw, 'A', 'A', 'follow_up_no_show', null, null, 'follow_up_task_no_show_2026-08-27', 42);
        UserNotification::query()->update(['cleared_at' => now()]);

        $service->notifyUserOnce($this->bhw, 'B', 'B', 'follow_up_no_show', null, null, 'follow_up_task_no_show_2026-08-28', 42);

        $this->assertDatabaseCount('notifications', 2);
    }

    /** Decision D-4: counts are database-backed, not derived from a capped client array. */
    public function test_counts_reflects_true_totals_across_categories(): void
    {
        $this->notification($this->bhw, 'follow_up_no_show');
        $this->notification($this->bhw, 'incoming_referral');
        $this->notification($this->bhw, 'account_created', isRead: true);
        $this->notification($this->bhw, 'incoming_referral', trashedAt: now());

        $response = $this->actingAs($this->bhw, 'sanctum')->getJson('/api/notifications/counts')->assertOk();

        $response->assertJsonPath('data.inbox', 3)
            ->assertJsonPath('data.unread', 2)
            ->assertJsonPath('data.followups', 1)
            ->assertJsonPath('data.referrals', 1)
            ->assertJsonPath('data.medicine', 0)
            ->assertJsonPath('data.system', 1)
            ->assertJsonPath('data.trash', 1);
    }

    /** Decision D-5: trash/restore round-trip, and a trashed item leaves the Inbox. */
    public function test_trash_and_restore_round_trip(): void
    {
        $notification = $this->notification($this->bhw, 'incoming_referral');

        $this->actingAs($this->bhw, 'sanctum')
            ->postJson("/api/notifications/{$notification->id}/trash")
            ->assertOk();

        $this->assertNotNull($notification->fresh()->trashed_at);
        $this->actingAs($this->bhw, 'sanctum')->getJson('/api/notifications')->assertJsonCount(0, 'data.data');
        $this->actingAs($this->bhw, 'sanctum')->getJson('/api/notifications/trash')->assertJsonCount(1, 'data.data');

        $this->actingAs($this->bhw, 'sanctum')
            ->postJson("/api/notifications/{$notification->id}/restore")
            ->assertOk();

        $this->assertNull($notification->fresh()->trashed_at);
        $this->actingAs($this->bhw, 'sanctum')->getJson('/api/notifications')->assertJsonCount(1, 'data.data');
    }

    /** Decision D-7 (N11): mark-unread is now real and survives a refetch. */
    public function test_mark_unread_persists_across_a_refetch(): void
    {
        $notification = $this->notification($this->bhw, 'incoming_referral', isRead: true);

        $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/notifications/{$notification->id}/unread")
            ->assertOk()
            ->assertJsonPath('data.is_read', false);

        $this->actingAs($this->bhw, 'sanctum')
            ->getJson('/api/notifications')
            ->assertJsonPath('data.data.0.is_read', false);
    }

    /** Ownership: trash/restore/unread all 403 for a non-owner, matching markRead/destroy. */
    public function test_trash_restore_and_unread_are_403_for_a_non_owner(): void
    {
        $notification = $this->notification($this->bhw, 'incoming_referral');

        $this->actingAs($this->otherBhw, 'sanctum')->postJson("/api/notifications/{$notification->id}/trash")->assertForbidden();
        $this->actingAs($this->otherBhw, 'sanctum')->postJson("/api/notifications/{$notification->id}/restore")->assertForbidden();
        $this->actingAs($this->otherBhw, 'sanctum')->patchJson("/api/notifications/{$notification->id}/unread")->assertForbidden();
    }

    /** Decision D-8: search reaches beyond whatever the client happens to have cached. */
    public function test_search_matches_on_title_and_message(): void
    {
        $this->notification($this->bhw, 'incoming_referral', title: 'New Incoming Referral', message: 'Juan Dela Cruz was referred.');
        $this->notification($this->bhw, 'account_created', title: 'Account created', message: 'Welcome.');

        $this->actingAs($this->bhw, 'sanctum')
            ->getJson('/api/notifications?search=Dela+Cruz')
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.type', 'incoming_referral');
    }

    /** Decision C3: only cleared/trashed rows past the retention window are pruned. */
    public function test_pruner_only_deletes_dismissed_rows_past_the_window(): void
    {
        $old = now()->subDays(10);
        $fresh = $this->notification($this->bhw, 'account_created');
        $oldCleared = $this->notification($this->bhw, 'account_created');
        $oldCleared->update(['cleared_at' => $old]);
        $recentlyCleared = $this->notification($this->bhw, 'account_created', clearedAt: now());

        $dryRunCount = app(NotificationPruner::class)->prune(dryRun: true);
        $this->assertSame(1, $dryRunCount);

        $pruned = app(NotificationPruner::class)->prune();

        $this->assertSame(1, $pruned);
        $this->assertDatabaseHas('notifications', ['id' => $fresh->id]);
        $this->assertDatabaseHas('notifications', ['id' => $recentlyCleared->id]);
        $this->assertDatabaseMissing('notifications', ['id' => $oldCleared->id]);
    }

    private function overdueTask(): FollowUpTask
    {
        $healthRecord = HealthRecord::create(['patient_id' => $this->patient->id]);

        return FollowUpTask::create([
            'health_record_id' => $healthRecord->id,
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'due_date' => now()->subDays(3)->toDateString(),
            'state' => FollowUpTask::STATE_PENDING,
        ]);
    }

    private function notification(
        User $user,
        string $type,
        bool $isRead = false,
        ?\DateTimeInterface $trashedAt = null,
        ?\DateTimeInterface $clearedAt = null,
        string $title = 'Title',
        string $message = 'Message'
    ): UserNotification {
        return UserNotification::create([
            'user_id' => $user->id,
            'title' => $title,
            'message' => $message,
            'type' => $type,
            'is_read' => $isRead,
            'trashed_at' => $trashedAt,
            'cleared_at' => $clearedAt,
        ]);
    }

    private function user(string $name, string $email, int $bhcId): User
    {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhcId,
        ]);
    }
}
