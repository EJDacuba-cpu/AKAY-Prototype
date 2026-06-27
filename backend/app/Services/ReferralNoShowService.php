<?php

namespace App\Services;

use App\Models\Referral;
use App\Models\ReferralUpdate;
use App\Models\User;

class ReferralNoShowService
{
    public function __construct(private UserNotificationService $notifications)
    {
    }

    public function markOverduePending(?Referral $targetReferral = null): int
    {
        $query = Referral::query()
            ->where('status', Referral::STATUS_PENDING)
            ->whereDate('referral_datetime', '<', now()->toDateString());

        if ($targetReferral) {
            $query->whereKey($targetReferral->getKey());
        }

        $referrals = $query
            ->with(['patient', 'barangayHealthCenter'])
            ->get();

        foreach ($referrals as $referral) {
            $referral->update(['status' => Referral::STATUS_NO_SHOW]);

            ReferralUpdate::create([
                'referral_id' => $referral->id,
                'previous_status' => Referral::STATUS_PENDING,
                'status' => Referral::STATUS_NO_SHOW,
                'remarks' => 'Automatically marked No-Show because the referral date passed without RHU receipt.',
            ]);

            $this->notifications->notifyUsersOnce(
                $this->bhcUsers($referral),
                'No-Show',
                "{$this->patientName($referral)} did not arrive at RHU on the referral date.",
                'referral_no_show',
                $referral->id,
                "/bhc/referrals/{$referral->tracking_id}",
                'referral_no_show',
                $referral->id
            );
        }

        return $referrals->count();
    }

    private function bhcUsers(Referral $referral)
    {
        return User::where('role', User::ROLE_BHW)
            ->where('barangay_health_center_id', $referral->barangay_health_center_id)
            ->where('status', User::STATUS_ACTIVE)
            ->get();
    }

    private function patientName(Referral $referral): string
    {
        return $referral->patient?->full_name ?: 'The referred patient';
    }
}
