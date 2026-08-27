<?php

namespace App\Services;

use App\Exceptions\ReferralWorkflowConflictException;
use App\Models\Referral;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * D-1 FINAL - rescheduling a No-Show referral.
 *
 * Scoped deliberately narrowly: this applies ONLY to an existing referral whose
 * status is already No-Show. The pre-submission, zero-provider-blocked case is
 * DOC-14a-DEFERRED and is NOT handled here or anywhere else.
 *
 * This is an ATTRIBUTE WRITE, not a status transition. It deliberately lives
 * outside ReferralWorkflowService so it cannot be confused with one:
 *
 *   - the referral REMAINS 'No-Show' (D-1; TRK-02's status set is untouched);
 *   - no referral_updates history row is written - rescheduled_by and
 *     rescheduled_at are the traceability record;
 *   - ReferralWorkflowService::transition() is never called, so the existing
 *     Pending->Received and No-Show->Received rules are unaffected. A patient
 *     who later arrives is still received through the normal late-arrival path.
 *
 * QRS-10 FINAL - binding: this must never touch qr_token_hash,
 * qr_token_encrypted, qr_token_issued_at or qr_token_last_used_at. Rescheduling
 * is not revocation, and `rescheduled_to` becoming populated is not an expiry
 * trigger. The existing QR stays valid through a reschedule exactly as it does
 * through any other attribute change.
 */
class ReferralRescheduleService
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly AuditLogger $auditLogger
    ) {
    }

    public function reschedule(Request $request, int $referralId, array $data): Referral
    {
        return DB::transaction(function () use ($request, $referralId, $data): Referral {
            $referral = Referral::query()
                ->whereKey($referralId)
                ->lockForUpdate()
                ->firstOrFail();

            $this->facilityAccess->authorizeRhuReferralAction($request->user(), $referral);

            $current = Referral::normalizeWorkflowStatus($referral->status);

            if ($current !== Referral::STATUS_NO_SHOW) {
                throw new ReferralWorkflowConflictException(
                    'Only a referral marked No-Show can be rescheduled.',
                    'REFERRAL_NOT_NO_SHOW',
                    $current ?? $referral->status,
                    Referral::STATUS_NO_SHOW
                );
            }

            // Re-rescheduling is permitted: the latest valid reschedule
            // overwrites the previous one, including clearing a reason that is
            // not supplied again.
            // Normalise to the application timezone before storing. Eloquent's
            // datetime cast formats on write without converting, but reads back
            // using the app timezone - so an offset-bearing input (an ISO-8601
            // string ending in Z, for example) would otherwise be re-read as a
            // different instant and silently move a clinic visit by hours.
            // This interprets the caller's instant; it does not supply one, so
            // DOC-14b's "caller-supplied ONLY" rule is untouched.
            $referral->update([
                'rescheduled_to' => Carbon::parse($data['rescheduled_to'])
                    ->setTimezone(config('app.timezone')),
                'reschedule_reason' => $data['reschedule_reason'] ?? null,
                'rescheduled_by' => $request->user()->id,
                'rescheduled_at' => now(),
            ]);

            $this->auditLogger->log(
                $request,
                'referral_rescheduled',
                'referrals',
                "Rescheduled referral {$referral->tracking_id} while it remains No-Show."
            );

            return $referral->fresh();
        });
    }
}
