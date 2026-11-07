<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\HealthRecordDraft;
use Illuminate\Support\Facades\DB;

class HealthRecordDraftPruner
{
    public function __construct(private readonly FormDraftRecoveryKeyService $recoveryKeys) {}

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
            'rural_health_unit_id',
            'rhu_visit_id',
            'patient_id',
            'consultation_uuid',
            'classification',
            'version',
        ])->chunkById(100, function ($drafts) use (&$expired, $now): void {
            foreach ($drafts as $draft) {
                $expire = function () use ($draft, &$expired, $now): void {
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

                    $draft->status = HealthRecordDraft::STATUS_EXPIRED;
                    $this->recoveryKeys->retireClinical($draft);

                    $expired++;
                    $this->audit('draft_expired', $draft);
                };
                if ($draft->consultation_uuid) {
                    $this->recoveryKeys->withClinicalIdentity($draft->consultation_uuid, $expire);
                } else {
                    DB::transaction($expire);
                }
            }
        });

        $pruned = 0;
        (clone $terminalQuery)->select([
            'id',
            'public_id',
            'owner_user_id',
            'barangay_health_center_id',
            'rural_health_unit_id',
            'rhu_visit_id',
            'patient_id',
            'consultation_uuid',
            'status',
            'classification',
            'version',
        ])->chunkById(100, function ($drafts) use (&$pruned): void {
            foreach ($drafts as $draft) {
                $prune = function () use ($draft, &$pruned): void {
                    $this->recoveryKeys->retireClinical($draft);
                    $this->audit('expired_drafts_pruned', $draft);
                    $pruned += HealthRecordDraft::query()->whereKey($draft->id)->delete();
                };
                if ($draft->consultation_uuid) $this->recoveryKeys->withClinicalIdentity($draft->consultation_uuid, $prune);
                else DB::transaction($prune);
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
