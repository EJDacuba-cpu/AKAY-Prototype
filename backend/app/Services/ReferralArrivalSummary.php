<?php

namespace App\Services;

use App\Models\Referral;

/**
 * What RHU intake may see of a referral: who arrived, from the BHC registration
 * record, and the referral's tracking status. No reason, findings, vitals,
 * diagnosis, or PhilHealth details; those stay behind clinical.history.
 */
class ReferralArrivalSummary
{
    public static function for(Referral $referral): array
    {
        $referral->loadMissing(['patient', 'barangayHealthCenter', 'ruralHealthUnit']);
        $patient = $referral->patient;

        return [
            'referral_id' => $referral->id,
            'tracking_id' => $referral->tracking_id,
            'status' => $referral->status,
            'referred_at' => $referral->created_at?->toISOString(),
            'patient' => [
                'id' => $patient?->id,
                'full_name' => $patient?->full_name,
                'birthdate' => $patient?->birthdate?->toDateString(),
                'age' => $patient?->age,
                'sex' => $patient?->sex,
                'address' => self::registrationAddress($patient),
                'contact_number' => $patient?->contact_number ?: null,
            ],
            'sending_bhc' => $referral->barangayHealthCenter?->name,
            'receiving_rhu' => $referral->ruralHealthUnit?->name,
        ];
    }

    private static function registrationAddress($patient): ?string
    {
        if (! $patient) {
            return null;
        }

        $parts = collect([
            $patient->street_address,
            $patient->barangay,
            $patient->municipality,
        ])->map(fn ($value) => trim((string) $value))->filter();

        return $parts->isEmpty() ? null : $parts->implode(', ');
    }

    /** Intake staff without Health Records get the summary instead of the full referral. */
    public static function appliesTo($user): bool
    {
        return $user->isRhu() && ! ActionPermissions::allows($user, 'clinical.history');
    }
}
