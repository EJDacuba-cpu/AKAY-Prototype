<?php

namespace App\Services;

use App\Models\Referral;

/**
 * What RHU intake may see of a referral: who arrived, from where, and its status.
 * No reason, findings, vitals, contact or PhilHealth details; those stay behind clinical.history.
 */
class ReferralArrivalSummary
{
    public static function for(Referral $referral): array
    {
        $referral->loadMissing(['patient', 'barangayHealthCenter', 'ruralHealthUnit']);

        return [
            'referral_id' => $referral->id,
            'tracking_id' => $referral->tracking_id,
            'status' => $referral->status,
            'referred_at' => $referral->created_at?->toISOString(),
            'patient' => [
                'id' => $referral->patient?->id,
                'full_name' => $referral->patient?->full_name,
                'age' => $referral->patient?->age,
                'sex' => $referral->patient?->sex,
            ],
            'sending_bhc' => $referral->barangayHealthCenter?->name,
            'receiving_rhu' => $referral->ruralHealthUnit?->name,
        ];
    }

    /** Intake staff without Health Records get the summary instead of the full referral. */
    public static function appliesTo($user): bool
    {
        return $user->isRhu() && ! ActionPermissions::allows($user, 'clinical.history');
    }
}
