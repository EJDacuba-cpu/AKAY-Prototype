<?php

namespace App\Services;

use App\Models\Referral;
use Illuminate\Support\Str;

class ReferralService
{
    public function makeTrackingId(): string
    {
        do {
            $trackingId = 'AKY-'.now()->format('Ymd').'-'.Str::upper(Str::random(6));
        } while (Referral::where('tracking_id', $trackingId)->exists());

        return $trackingId;
    }

    public function makeLegacyQrPlaceholder(): string
    {
        return 'AKAY:LEGACY-DISABLED:'.Str::uuid();
    }
}
