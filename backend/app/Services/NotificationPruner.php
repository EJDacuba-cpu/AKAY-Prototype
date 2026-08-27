<?php

namespace App\Services;

use App\Models\UserNotification;

/**
 * Decision C3 - notifications had no pruning at all, unlike
 * health_record_drafts and referral_holds. Mirrors both exactly: only rows
 * already moved to a terminal, dismissed state are eligible. A notification
 * nobody has cleared or trashed yet - including one nobody has read - is
 * left alone indefinitely; deleting something the user hasn't acted on
 * would be a correctness regression, not cleanup.
 *
 * cleared_at and trashed_at share one retention window (Decision D-6):
 * both represent "already dismissed, kept briefly for recovery," so there
 * is no reason for them to expire on different schedules.
 */
class NotificationPruner
{
    public function prune(bool $dryRun = false): int
    {
        $cutoff = now()->subDays(config('operations.notifications.cleared_retention_days'));

        $query = UserNotification::query()
            ->where(fn ($q) => $q->whereNotNull('cleared_at')->orWhereNotNull('trashed_at'))
            ->where(fn ($q) => $q->where('cleared_at', '<=', $cutoff)->orWhere('trashed_at', '<=', $cutoff));

        if ($dryRun) {
            return $query->count();
        }

        return $query->delete();
    }
}
