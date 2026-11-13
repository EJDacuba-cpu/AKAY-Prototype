<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\Referral;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * RHU staff receive referral slips, not another facility's Clinic Ledger.
 * Linked BHC health records are reduced to slip clinical fields before JSON.
 */
class ReferralLinkedRecordRedactor
{
    public function redact(Referral $referral, User $user): Referral
    {
        if (! $user->isRhu() || ! $referral->relationLoaded('healthRecord')) {
            return $referral;
        }

        $record = $referral->healthRecord;
        if (! $record instanceof HealthRecord) {
            return $referral;
        }

        $referral->setRelation('healthRecord', $this->slipRecord($record));

        return $referral;
    }

    /**
     * @param  Collection<int, Referral>|iterable<int, Referral>  $referrals
     * @return Collection<int, Referral>
     */
    public function redactMany(iterable $referrals, User $user): Collection
    {
        return Collection::make($referrals)
            ->map(fn (Referral $referral): Referral => $this->redact($referral, $user));
    }

    private function slipRecord(HealthRecord $record): HealthRecord
    {
        $clinical = $record->toReferralSlipClinicalArray();
        $slip = new HealthRecord;
        $slip->forceFill($clinical);
        $slip->id = $clinical['id'];
        $slip->exists = true;
        $slip->syncOriginal();
        $slip->setVisible(array_keys($clinical));
        $slip->makeHidden(['outcome', 'outcome_sub_label']);

        return $slip;
    }
}
