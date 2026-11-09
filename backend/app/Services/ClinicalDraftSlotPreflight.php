<?php

namespace App\Services;

use App\Models\HealthRecordDraft;

/** Read-only deployment report: never decrypts, chooses, or deletes a draft. */
class ClinicalDraftSlotPreflight
{
    public function conflicts(): array
    {
        return HealthRecordDraft::query()->where('status', 'active')
            ->get(['public_id', 'barangay_health_center_id', 'rural_health_unit_id', 'rhu_visit_id', 'patient_id', 'expires_at'])
            ->filter(fn ($draft) => $draft->rural_health_unit_id ? $draft->rhu_visit_id !== null : $draft->barangay_health_center_id !== null)
            ->groupBy(fn ($draft) => $draft->rural_health_unit_id
                ? 'rhu:'.$draft->rural_health_unit_id.'|visit:'.$draft->rhu_visit_id
                : 'bhc:'.$draft->barangay_health_center_id.'|patient:'.$draft->patient_id)
            ->filter(fn ($drafts) => $drafts->count() > 1)
            ->map(fn ($drafts, $slot) => [
                'slot' => $slot,
                'draft_ids' => $drafts->pluck('public_id')->values()->all(),
                'expired_ids' => $drafts->filter(fn ($draft) => $draft->expires_at?->lte(now()))->pluck('public_id')->values()->all(),
            ])->values()->all();
    }
}
