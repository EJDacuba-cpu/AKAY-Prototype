<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\ReferralUpdate;
use App\Models\User;
use Illuminate\Http\Request;

class ReferralCreationService
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly ReferralRoutingService $referralRouting,
        private readonly ReferralService $referrals,
        private readonly AuditLogger $auditLogger,
        private readonly UserNotificationService $notifications,
        private readonly ReferralSubmissionGate $submissionGate
    ) {
    }

    public function create(
        Request $request,
        Patient $patient,
        array $data,
        ?HealthRecord $healthRecord = null
    ): Referral {
        $user = $request->user();
        abort_unless($user?->isBhw(), 403, 'Only BHW accounts can create referrals.');

        $route = $this->referralRouting->resolveForBhw($user);
        $this->facilityAccess->authorizePatientModification($user, $patient);

        if ($healthRecord) {
            $this->facilityAccess->authorizeHealthRecord($user, $healthRecord);
            abort_unless(
                (int) $healthRecord->patient_id === (int) $patient->id
                    && (int) $healthRecord->barangay_health_center_id
                        === (int) $user->barangay_health_center_id,
                422,
                'Health record must belong to the referred patient.'
            );
        }

        // DOC-14 then REF-SLIP-05c. Placed here rather than in the
        // controllers so both submission paths are covered by one call site,
        // and so it sits after the client_submission_id replay checks: a retry
        // of an already-created referral must not be blocked by an availability
        // change that happened after the original submission.
        $gate = $this->submissionGate->assertCanSubmit($route['rhu'], $data);

        $referral = Referral::create([
            ...$data,
            ...$gate,
            'patient_id' => $patient->id,
            'health_record_id' => $healthRecord?->id,
            'barangay_health_center_id' => $route['bhc']->id,
            'rural_health_unit_id' => $route['rhu']->id,
            'tracking_id' => $trackingId = $this->referrals->makeTrackingId(),
            'qr_code_value' => $this->referrals->makeLegacyQrPlaceholder(),
            'created_by' => $user->id,
            'status' => Referral::STATUS_PENDING,
            'urgency_level' => $data['urgency_level'] ?? Referral::ATTENTION_ROUTINE,
            'referral_datetime' => $data['referral_datetime'] ?? now(),
        ]);

        ReferralUpdate::create([
            'referral_id' => $referral->id,
            'user_id' => $user->id,
            'status' => Referral::STATUS_PENDING,
            'remarks' => 'Referral submitted.',
        ]);

        $referral->loadMissing(['patient', 'barangayHealthCenter', 'ruralHealthUnit']);
        $patientName = $referral->patient?->full_name ?: 'The referred patient';
        $bhcName = $referral->barangayHealthCenter?->name ?: 'BHC';

        $this->notifications->notifyUsersOnce(
            User::where('role', User::ROLE_RHU_STAFF)
                ->where('rural_health_unit_id', $referral->rural_health_unit_id)
                ->where('status', User::STATUS_ACTIVE)
                ->get(),
            'New Incoming Referral',
            "{$bhcName} sent a referral for {$patientName}.",
            'incoming_referral',
            $referral->id,
            "/rhu/referrals/{$referral->tracking_id}",
            'referral',
            $referral->id
        );

        $this->notifications->notifyUsersOnce(
            User::where('role', User::ROLE_BHW)
                ->where('barangay_health_center_id', $referral->barangay_health_center_id)
                ->where('status', User::STATUS_ACTIVE)
                ->get(),
            'Referral Submitted',
            'The referral was successfully sent to RHU.',
            'referral_submitted',
            $referral->id,
            "/bhc/referrals/{$referral->tracking_id}",
            'referral',
            $referral->id
        );

        $this->auditLogger->log(
            $request,
            'submitted',
            'referrals',
            "Submitted referral {$referral->tracking_id}."
        );

        return $referral;
    }
}
