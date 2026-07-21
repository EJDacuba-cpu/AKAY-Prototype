<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\HealthRecordDraft;
use Illuminate\Support\Facades\DB;

class HealthRecordDraftPruner
{
    public function prune(bool $dryRun = false): array
    {
        $now = now();
        $expiredQuery = HealthRecordDraft::query()
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->where('expires_at', '<=', $now);
        $terminalQuery = HealthRecordDraft::query()
            ->whereIn('status', [
                HealthRecordDraft::STATUS_CONSUMED,
                HealthRecordDraft::STATUS_DISCARDED,
                HealthRecordDraft::STATUS_EXPIRED,
            ])
            ->where('updated_at', '<=', $now->copy()->subDays(
                config('health_record_drafts.terminal_retention_days')
            ));

        if ($dryRun) {
            return [
                'expired' => (clone $expiredQuery)->count(),
                'pruned' => (clone $terminalQuery)->count(),
            ];
        }

        $expired = 0;
        (clone $expiredQuery)->select([
            'id',
            'public_id',
            'owner_user_id',
            'barangay_health_center_id',
            'classification',
            'version',
        ])->chunkById(100, function ($drafts) use (&$expired, $now): void {
            foreach ($drafts as $draft) {
                DB::transaction(function () use ($draft, &$expired, $now): void {
                    $updated = HealthRecordDraft::query()
                        ->whereKey($draft->id)
                        ->where('status', HealthRecordDraft::STATUS_ACTIVE)
                        ->where('expires_at', '<=', $now)
                        ->update([
                            'status' => HealthRecordDraft::STATUS_EXPIRED,
                            'encrypted_payload' => null,
                            'updated_at' => $now,
                        ]);
                    if ($updated !== 1) {
                        return;
                    }

                    $expired++;
                    $this->audit('draft_expired', $draft);
                });
            }
        });

        $pruned = 0;
        (clone $terminalQuery)->select([
            'id',
            'public_id',
            'owner_user_id',
            'barangay_health_center_id',
            'classification',
            'version',
        ])->chunkById(100, function ($drafts) use (&$pruned): void {
            foreach ($drafts as $draft) {
                DB::transaction(function () use ($draft, &$pruned): void {
                    $this->audit('expired_drafts_pruned', $draft);
                    $pruned += HealthRecordDraft::query()->whereKey($draft->id)->delete();
                });
            }
        });

        return compact('expired', 'pruned');
    }

    private function audit(string $action, HealthRecordDraft $draft): void
    {
        AuditLog::create([
            'user_id' => $draft->owner_user_id,
            'action' => $action,
            'module' => 'health_record_drafts',
            'description' => implode('; ', [
                "draft_public_id={$draft->public_id}",
                "owner_user_id={$draft->owner_user_id}",
                "bhc_id={$draft->barangay_health_center_id}",
                "classification={$draft->classification}",
                "version={$draft->version}",
            ]).'.',
        ]);
    }
}
