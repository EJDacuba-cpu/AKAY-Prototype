<?php

namespace App\Services;

use App\Models\FollowUpTask;
use App\Models\User;

class FollowUpNotificationService
{
    public function __construct(private readonly UserNotificationService $notifications)
    {
    }

    public function notifyDueForUser(User $user): void
    {
        if (! $user->isBhw()) {
            // TODO: Add admin-level follow-up notifications once admin notification destinations are defined.
            return;
        }

        $users = User::where('role', User::ROLE_BHW)
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->where('status', User::STATUS_ACTIVE)
            ->get();

        $today = now()->toDateString();
        $activeStates = [FollowUpTask::STATE_PENDING, FollowUpTask::STATE_RESCHEDULED];

        FollowUpTask::query()
            ->with('patient')
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->whereIn('state', $activeStates)
            ->whereDate('due_date', '<', $today)
            ->get()
            ->each(function (FollowUpTask $task) use ($users): void {
                $patientName = $task->patient?->full_name ?: 'The patient';
                $taskDate = $task->due_date?->toDateString() ?: 'unknown-date';

                $task->update([
                    'state' => FollowUpTask::STATE_NO_SHOW,
                    'no_show_at' => now(),
                ]);

                $this->notifications->notifyUsersOnce(
                    $users,
                    'No-Show',
                    "{$patientName} missed the scheduled follow-up date.",
                    'follow_up_no_show',
                    null,
                    "/bhc/follow-ups?task={$task->id}&open=no_show",
                    "follow_up_task_no_show_{$taskDate}",
                    $task->id
                );
            });

        FollowUpTask::query()
            ->with('patient')
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->whereIn('state', $activeStates)
            ->whereDate('due_date', $today)
            ->get()
            ->each(function (FollowUpTask $task) use ($users): void {
                $patientName = $task->patient?->full_name ?: 'The patient';
                $taskDate = $task->due_date?->toDateString() ?: 'unknown-date';

                $this->notifications->notifyUsersOnce(
                    $users,
                    'Follow-up Today',
                    "{$patientName} is scheduled for follow-up today.",
                    'follow_up_due_today',
                    null,
                    "/bhc/follow-ups?task={$task->id}&open=due",
                    "follow_up_task_due_{$taskDate}",
                    $task->id
                );
            });
    }
}
