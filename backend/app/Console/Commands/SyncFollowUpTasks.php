<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\FollowUpTaskSyncService;
use Illuminate\Console\Command;
use Throwable;

class SyncFollowUpTasks extends Command
{
    protected $signature = 'follow-ups:sync';

    protected $description = 'Backfill follow-up tasks from existing health records for every barangay health center.';

    public function handle(FollowUpTaskSyncService $followUpTasks): int
    {
        // Sync runs through a facility-scoped user so the existing authorization
        // checks apply unchanged. One active BHW per centre covers every record
        // that can own a follow-up task.
        $users = User::query()
            ->where('role', User::ROLE_BHW)
            ->where('status', User::STATUS_ACTIVE)
            ->whereNotNull('barangay_health_center_id')
            ->orderBy('id')
            ->get()
            ->unique('barangay_health_center_id');

        if ($users->isEmpty()) {
            $this->warn('No active BHW users with a barangay health center assignment were found.');

            return self::SUCCESS;
        }

        $failed = 0;

        foreach ($users as $user) {
            try {
                $followUpTasks->syncEligibleRecordsForUser($user);
                $this->line("Synced barangay health center {$user->barangay_health_center_id}.");
            } catch (Throwable $exception) {
                $failed++;
                $this->error(
                    "Failed to sync barangay health center {$user->barangay_health_center_id}: {$exception->getMessage()}"
                );
            }
        }

        $this->info("Synced {$users->count()} barangay health center(s), {$failed} failed.");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
