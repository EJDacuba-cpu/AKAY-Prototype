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
            ->whereDate('due_date', $today)
            ->get()
            ->each(function (FollowUpTask $task) use ($users): void {
                $patientName = $task->patient?->full_name ?: 'The patient';

                $this->notifications->notifyUsersOnce(
                    $users,
                    'Follow-up Due Today',
                    "{$patientName} is scheduled for follow-up today.",
                    'follow_up_due_today',
                    null,
                    "/bhc/follow-ups?task={$task->id}&open=due",
                    'follow_up_task',
                    $task->id
                );
            });

        FollowUpTask::query()
            ->with('patient')
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->whereIn('state', $activeStates)
            ->whereDate('due_date', '<', $today)
            ->get()
            ->each(function (FollowUpTask $task) use ($users): void {
                $patientName = $task->patient?->full_name ?: 'The patient';

                $this->notifications->notifyUsersOnce(
                    $users,
                    'Overdue Follow-up',
                    "{$patientName} missed the scheduled follow-up date.",
                    'overdue_follow_up',
                    null,
                    "/bhc/follow-ups?task={$task->id}&open=overdue",
                    'follow_up_task',
                    $task->id
                );
            });
    }
}
