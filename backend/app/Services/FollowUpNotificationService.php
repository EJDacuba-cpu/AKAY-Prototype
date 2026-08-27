<?php

namespace App\Services;

use App\Models\FollowUpTask;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Decision A1 (notification-system-remediation-implementation.md) - this
 * used to run inside NotificationController::index() and
 * FollowUpTaskController::index(), transitioning overdue follow-ups to
 * No-Show as a side effect of a GET request. Whether a patient's follow-up
 * got marked No-Show depended on whether anyone happened to load a page
 * that day. sweep() is called only from the follow-ups:mark-no-show
 * scheduled command now, off every read path.
 *
 * A scheduled command has no calling user to scope by, unlike the old
 * per-request notifyDueForUser(User $user), so this sweeps every BHC in one
 * pass - mirroring how ReferralNoShowService::markOverduePending() already
 * scans globally rather than per caller.
 */
class FollowUpNotificationService
{
    public function __construct(private readonly UserNotificationService $notifications)
    {
    }

    /**
     * @return array{transitioned: int, notified: int}
     */
    public function sweep(bool $dryRun = false): array
    {
        $today = now()->toDateString();
        $activeStates = [FollowUpTask::STATE_PENDING, FollowUpTask::STATE_RESCHEDULED];

        $overdueQuery = FollowUpTask::query()
            ->whereIn('state', $activeStates)
            ->whereDate('due_date', '<', $today);
        $dueTodayQuery = FollowUpTask::query()
            ->whereIn('state', $activeStates)
            ->whereDate('due_date', $today);

        if ($dryRun) {
            return [
                'transitioned' => (clone $overdueQuery)->count(),
                'notified' => (clone $overdueQuery)->count() + (clone $dueTodayQuery)->count(),
            ];
        }

        /** @var array<int, Collection<int, User>> $bhwCache */
        $bhwCache = [];
        $bhwsFor = function (int $barangayHealthCenterId) use (&$bhwCache): Collection {
            return $bhwCache[$barangayHealthCenterId] ??= User::query()
                ->where('role', User::ROLE_BHW)
                ->where('barangay_health_center_id', $barangayHealthCenterId)
                ->where('status', User::STATUS_ACTIVE)
                ->get();
        };

        $notified = 0;
        $overdue = $overdueQuery->with('patient')->get();

        foreach ($overdue as $task) {
            $patientName = $task->patient?->full_name ?: 'The patient';
            $taskDate = $task->due_date?->toDateString() ?: 'unknown-date';

            $task->update([
                'state' => FollowUpTask::STATE_NO_SHOW,
                'no_show_at' => now(),
            ]);

            $this->notifications->notifyUsersOnce(
                $bhwsFor((int) $task->barangay_health_center_id),
                'No-Show',
                "{$patientName} missed the scheduled follow-up date.",
                'follow_up_no_show',
                null,
                "/bhc/follow-ups?task={$task->id}&open=no_show",
                "follow_up_task_no_show_{$taskDate}",
                $task->id
            );
            $notified++;
        }

        $dueTodayQuery->with('patient')->get()->each(function (FollowUpTask $task) use (&$notified, $bhwsFor, $today): void {
            $patientName = $task->patient?->full_name ?: 'The patient';

            $this->notifications->notifyUsersOnce(
                $bhwsFor((int) $task->barangay_health_center_id),
                'Follow-up Today',
                "{$patientName} is scheduled for follow-up today.",
                'follow_up_due_today',
                null,
                "/bhc/follow-ups?task={$task->id}&open=due",
                "follow_up_task_due_{$today}",
                $task->id
            );
            $notified++;
        });

        return ['transitioned' => $overdue->count(), 'notified' => $notified];
    }
}
