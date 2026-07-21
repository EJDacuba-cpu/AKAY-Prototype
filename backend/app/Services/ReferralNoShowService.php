<?php

namespace App\Services;

use App\Models\Referral;
class ReferralNoShowService
{
    public function __construct(private readonly ReferralWorkflowService $workflow)
    {
    }

    public function markOverduePending(?Referral $targetReferral = null, bool $dryRun = false): int
    {
        $query = Referral::query()
            ->where('status', Referral::STATUS_PENDING)
            ->whereDate('referral_datetime', '<', now()->toDateString());

        if ($targetReferral) {
            $query->whereKey($targetReferral->getKey());
        }

        $ids = $query->pluck('id');

        if ($dryRun) {
            return $ids->count();
        }

        $updated = 0;
        foreach ($ids as $referralId) {
            if ($this->workflow->markNoShow((int) $referralId)) {
                $updated++;
            }
        }

        return $updated;
    }
}
