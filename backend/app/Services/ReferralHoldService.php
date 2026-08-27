<?php

namespace App\Services;

use App\Models\Patient;
use App\Models\ReferralHold;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Records a DOC-14 blocked-submission attempt and, separately, notifies the
 * BHWs waiting on it once a provider at that RHU actually becomes available.
 *
 * Deliberately outside ReferralSubmissionGate: the gate stays a pure,
 * side-effect-free live check. This service is called only AFTER the gate
 * has already thrown and that transaction has already rolled back - so
 * recordBlockedAttempt() always runs in its own, fresh transaction, never
 * nested inside the one that failed.
 */
class ReferralHoldService
{
    public function __construct(
        private readonly UserNotificationService $notifications
    ) {
    }

    /**
     * @param  array{health_record_id?: int|null, urgency_level?: string|null, preferred_provider_id?: int|null}  $data
     */
    public function recordBlockedAttempt(
        User $bhw,
        Patient $patient,
        int $barangayHealthCenterId,
        RuralHealthUnit $rhu,
        array $data
    ): ReferralHold {
        return DB::transaction(fn (): ReferralHold => ReferralHold::create([
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $barangayHealthCenterId,
            'rural_health_unit_id' => $rhu->id,
            'created_by' => $bhw->id,
            'health_record_id' => $data['health_record_id'] ?? null,
            'urgency_level' => $data['urgency_level'] ?? null,
            'preferred_provider_id' => $data['preferred_provider_id'] ?? null,
            'status' => ReferralHold::STATUS_WAITING,
        ]));
    }

    /**
     * Called from RhuProviderController::update() right after a provider's
     * availability_status flips to Available. Notifies every BHW with a
     * still-waiting hold at this RHU. Not deduplicated by
     * notifyUsersOnce()'s permanent per-entity key - a BHW who has not yet
     * acted should hear about EVERY subsequent availability window, not just
     * the first. A short cooldown (last_notified_at) prevents a burst of
     * near-simultaneous provider updates from paging the same BHW repeatedly.
     */
    public function notifyWaitingHolds(RuralHealthUnit $rhu): void
    {
        $cooldownMinutes = config('operations.referral_holds.notify_cooldown_minutes');

        ReferralHold::query()
            ->where('rural_health_unit_id', $rhu->id)
            ->where('status', ReferralHold::STATUS_WAITING)
            ->where(function ($query) use ($cooldownMinutes): void {
                $query->whereNull('last_notified_at')
                    ->orWhere('last_notified_at', '<=', now()->subMinutes($cooldownMinutes));
            })
            ->with(['patient', 'creator'])
            ->get()
            ->each(function (ReferralHold $hold) use ($rhu): void {
                $patientName = $hold->patient?->full_name ?: 'A previously blocked referral';

                $this->notifications->notifyUser(
                    $hold->creator,
                    'Doctor Now Available',
                    "{$rhu->name} may now have an available doctor - {$patientName} can be resubmitted.",
                    'referral_hold_available',
                    null,
                    "/bhc/referrals/create?resume_hold={$hold->id}",
                    'referral_hold',
                    $hold->id
                );

                $hold->update(['last_notified_at' => now()]);
            });
    }

    public function discard(ReferralHold $hold): void
    {
        $hold->update([
            'status' => ReferralHold::STATUS_DISCARDED,
            'resolved_at' => now(),
        ]);
    }

    public function markResubmitted(ReferralHold $hold, int $referralId): void
    {
        $hold->update([
            'status' => ReferralHold::STATUS_RESUBMITTED,
            'resolved_at' => now(),
            'resolved_referral_id' => $referralId,
        ]);
    }
}
