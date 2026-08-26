<?php

namespace App\Services;

use App\Models\ReferralHold;

class ReferralHoldPruner
{
    public function prune(bool $dryRun = false): int
    {
        $query = ReferralHold::query()
            ->where('status', ReferralHold::STATUS_WAITING)
            ->where('created_at', '<=', now()->subDays(
                config('operations.referral_holds.expire_after_days')
            ));

        if ($dryRun) {
            return $query->count();
        }

        return $query->update(['status' => ReferralHold::STATUS_EXPIRED]);
    }
}
