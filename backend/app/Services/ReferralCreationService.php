<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\ReferralHold;
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
        abort_unless($user?->isBhc(), 403, 'Only BHW accounts can create referrals.');

        ActionPermissions::ensure($user, 'referrals.submit');
        $route = $this->referralRouting->resolveForBhc($user, isset($data['rural_health_unit_id']) ? (int) $data['rural_health_unit_id'] : null);
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

        $hold = $this->lockResumableHold($data, $patient, $route['bhc']->id);
        if ($hold?->status === ReferralHold::STATUS_RESUBMITTED && $hold->resolved_referral_id) {
            return Referral::query()->findOrFail($hold->resolved_referral_id);
        }

        // DOC-14. Placed here rather than in the
        // controllers so both submission paths are covered by one call site,
        // and so it sits after the client_submission_id replay checks: a retry
        // of an already-created referral must not be blocked by an availability
        // change that happened after the original submission.
        $gate = $this->submissionGate->assertCanSubmit($route['rhu']);

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
            'referral_datetime' => now(),
            'referring_practitioner' => $this->referringPractitioner($data, $healthRecord, $user),
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
            User::where('role', User::ROLE_RHU)
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
            User::where('role', User::ROLE_BHC)
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

        if ($hold) {
            app(ReferralHoldService::class)->markResubmitted($hold, $referral->id);
            $recordToUpdate = $healthRecord ?? $hold->healthRecord;
            if ($recordToUpdate) {
                $monitoring = $recordToUpdate->monitoring_data ?? [];
                $outcomes = array_map(function ($outcome) use ($hold, $referral) {
                    if ((int) ($outcome['holdId'] ?? 0) !== (int) $hold->id) {
                        return $outcome;
                    }

                    return ['entryId' => $outcome['entryId'], 'referralId' => $referral->id, 'trackingId' => $referral->tracking_id];
                }, $monitoring['conditionReferralOutcomes'] ?? []);
                $recordToUpdate->update([
                    'monitoring_data' => [
                        ...$monitoring,
                        ...($outcomes !== [] ? ['conditionReferralOutcomes' => $outcomes] : []),
                        'referralStatus' => 'Submitted',
                        'submissionStatus' => 'Submitted',
                        'linkedTrackingId' => $referral->tracking_id,
                    ],
                ]);
            }
        }

        return $referral;
    }

    private function lockResumableHold(array $data, Patient $patient, int $bhcId): ?ReferralHold
    {
        if (empty($data['resume_hold_id'])) {
            return null;
        }

        $hold = ReferralHold::query()
            ->where('id', $data['resume_hold_id'])
            ->where('barangay_health_center_id', $bhcId)
            ->lockForUpdate()
            ->first();

        abort_unless($hold, 404);
        abort_unless(
            (int) $hold->patient_id === (int) $patient->id,
            422,
            'This waiting referral belongs to a different patient.'
        );

        if ($hold->status === ReferralHold::STATUS_RESUBMITTED && $hold->resolved_referral_id) {
            return $hold;
        }

        abort_unless(
            $hold->status === ReferralHold::STATUS_WAITING,
            422,
            'This waiting referral is already resolved.'
        );

        return $hold;
    }

    private function referringPractitioner(array $data, ?HealthRecord $healthRecord, User $user): ?string
    {
        $fromRequest = trim((string) ($data['referring_practitioner'] ?? ''));
        if ($fromRequest !== '') {
            return $fromRequest;
        }

        $monitoring = is_array($healthRecord?->monitoring_data) ? $healthRecord->monitoring_data : [];
        foreach (['attendingStaff', 'attending_staff'] as $key) {
            $value = trim((string) ($monitoring[$key] ?? ''));
            if ($value !== '') {
                return $value;
            }
        }

        $name = trim((string) ($user->name ?? ''));

        return $name !== '' ? $name : null;
    }
}
