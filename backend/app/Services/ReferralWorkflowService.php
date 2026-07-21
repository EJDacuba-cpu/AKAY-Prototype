<?php

namespace App\Services;

use App\Exceptions\ReferralWorkflowConflictException;
use App\Models\AuditLog;
use App\Models\Feedback;
use App\Models\Referral;
use App\Models\ReferralUpdate;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReferralWorkflowService
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly UserNotificationService $notifications,
        private readonly AuditLogger $auditLogger,
        private readonly AkayCacheService $cache
    ) {
    }

    public function transition(
        Request $request,
        int $referralId,
        string $requestedStatus,
        ?string $reason = null
    ): array {
        $result = DB::transaction(function () use ($request, $referralId, $requestedStatus, $reason): array {
            $referral = $this->lockReferralForTransition($referralId);
            $this->facilityAccess->authorizeRhuReferralAction($request->user(), $referral);

            $current = $this->canonicalStatusOrConflict($referral->status, $requestedStatus);
            $requested = Referral::normalizeWorkflowStatus($requestedStatus);

            if ($requested === null) {
                throw ValidationException::withMessages([
                    'status' => ['The selected referral status is invalid.'],
                ]);
            }

            if ($current === Referral::STATUS_COMPLETED) {
                throw new ReferralWorkflowConflictException(
                    'This referral has already been completed and cannot be changed.',
                    'REFERRAL_ALREADY_COMPLETED',
                    $current,
                    $requested
                );
            }

            if ($current === $requested) {
                return $this->result($referral, true);
            }

            $lateArrival = $current === Referral::STATUS_NO_SHOW
                && $requested === Referral::STATUS_RECEIVED;

            if ($lateArrival && trim((string) $reason) === '') {
                throw ValidationException::withMessages([
                    'remarks' => ['A late-arrival note is required.'],
                ]);
            }

            if (! $this->isAllowedInteractiveTransition($current, $requested)) {
                $this->throwInvalidTransition($current, $requested);
            }

            $referral->update(array_filter([
                'status' => $requested,
                'remarks' => $reason,
            ], fn (mixed $value): bool => $value !== null));

            $this->recordHistory($referral, $request->user(), $current, $requested, $reason);

            if ($requested === Referral::STATUS_RECEIVED) {
                $this->linkPatientToReceivingRhu($referral);
                $this->notifyReceived($referral, $lateArrival);
            }

            $this->auditLogger->log(
                $request,
                $lateArrival ? 'late_arrival_received' : 'status_updated',
                'referrals',
                "Referral {$referral->tracking_id} changed from {$current} to {$requested}."
            );

            return $this->result($referral->fresh(), false);
        });

        if (! $result['status_unchanged']) {
            $this->cache->invalidateReferralReports($result['referral']);
        }

        return $result;
    }

    public function completeWithFeedback(
        Request $request,
        int $referralId,
        array $feedbackData
    ): Feedback {
        $feedback = DB::transaction(function () use ($request, $referralId, $feedbackData): Feedback {
            $referral = $this->lockReferralForTransition($referralId);
            $this->facilityAccess->authorizeRhuReferralAction($request->user(), $referral);
            $current = $this->canonicalStatusOrConflict(
                $referral->status,
                Referral::STATUS_COMPLETED
            );

            if ($current === Referral::STATUS_COMPLETED || $referral->feedback()->exists()) {
                throw new ReferralWorkflowConflictException(
                    'RHU feedback has already been recorded for this referral.',
                    'REFERRAL_ALREADY_COMPLETED',
                    $current,
                    Referral::STATUS_COMPLETED
                );
            }

            if ($current !== Referral::STATUS_RECEIVED) {
                throw new ReferralWorkflowConflictException(
                    'The referral must be marked as Received before RHU feedback can be recorded.',
                    'REFERRAL_NOT_RECEIVED',
                    $current,
                    Referral::STATUS_COMPLETED
                );
            }

            $feedback = Feedback::create([
                ...$feedbackData,
                'referral_id' => $referral->id,
                'created_by' => $request->user()->id,
                'received_at' => $feedbackData['received_at'] ?? now(),
            ]);

            $referral->update(['status' => Referral::STATUS_COMPLETED]);
            $this->recordHistory(
                $referral,
                $request->user(),
                $current,
                Referral::STATUS_COMPLETED,
                'RHU feedback submitted.'
            );
            $this->notifyCompleted($referral);
            $this->auditLogger->log(
                $request,
                'feedback_completed',
                'referrals',
                "Completed referral {$referral->tracking_id} with RHU feedback."
            );

            return $feedback->load('referral.patient');
        });

        $this->cache->invalidateReferralReports($feedback->referral);

        return $feedback;
    }

    public function markNoShow(int $referralId): bool
    {
        $updated = DB::transaction(function () use ($referralId): bool {
            $referral = $this->lockReferralForTransition($referralId);
            $current = Referral::normalizeWorkflowStatus($referral->status);

            if ($current !== Referral::STATUS_PENDING || ! $this->isOverdue($referral)) {
                return false;
            }

            $reason = 'Automatically marked No-Show because the referral date passed without RHU receipt.';
            $referral->update(['status' => Referral::STATUS_NO_SHOW]);
            $this->recordHistory(
                $referral,
                null,
                Referral::STATUS_PENDING,
                Referral::STATUS_NO_SHOW,
                $reason
            );
            $this->notifyNoShow($referral);
            AuditLog::create([
                'user_id' => null,
                'action' => 'automatic_no_show',
                'module' => 'referrals',
                'description' => "Automatically marked referral {$referral->tracking_id} as No-Show.",
            ]);

            return true;
        });

        if ($updated) {
            $referral = Referral::find($referralId);
            if ($referral !== null) {
                $this->cache->invalidateReferralReports($referral);
            }
        }

        return $updated;
    }

    public function isOverdue(Referral $referral): bool
    {
        return $referral->referral_datetime !== null
            && $referral->referral_datetime->toDateString() < now()->toDateString();
    }

    private function lockReferralForTransition(int $referralId): Referral
    {
        return Referral::query()
            ->whereKey($referralId)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function canonicalStatusOrConflict(string $currentStatus, string $requestedStatus): string
    {
        $current = Referral::normalizeWorkflowStatus($currentStatus);

        if ($current === null) {
            throw new ReferralWorkflowConflictException(
                'This referral has an unsupported status and cannot be changed automatically.',
                'INVALID_REFERRAL_STATUS_TRANSITION',
                $currentStatus,
                Referral::normalizeWorkflowStatus($requestedStatus) ?? $requestedStatus
            );
        }

        return $current;
    }

    private function isAllowedInteractiveTransition(string $current, string $requested): bool
    {
        return ($current === Referral::STATUS_PENDING && $requested === Referral::STATUS_RECEIVED)
            || ($current === Referral::STATUS_NO_SHOW && $requested === Referral::STATUS_RECEIVED);
    }

    private function throwInvalidTransition(string $current, string $requested): never
    {
        throw new ReferralWorkflowConflictException(
            'This referral can no longer be changed from its current status to the requested status.',
            'INVALID_REFERRAL_STATUS_TRANSITION',
            $current,
            $requested
        );
    }

    private function recordHistory(
        Referral $referral,
        ?User $user,
        string $previous,
        string $status,
        ?string $reason
    ): void {
        ReferralUpdate::create([
            'referral_id' => $referral->id,
            'user_id' => $user?->id,
            'previous_status' => $previous,
            'status' => $status,
            'remarks' => $reason,
        ]);
    }

    private function linkPatientToReceivingRhu(Referral $referral): void
    {
        $referral->loadMissing('patient');

        if ($referral->patient
            && (int) $referral->patient->rural_health_unit_id !== (int) $referral->rural_health_unit_id) {
            $referral->patient->update([
                'rural_health_unit_id' => $referral->rural_health_unit_id,
            ]);
        }
    }

    private function notifyReceived(Referral $referral, bool $lateArrival): void
    {
        $referral->loadMissing(['patient', 'ruralHealthUnit']);
        $patientName = $referral->patient?->full_name ?: 'The referred patient';
        $rhuName = $referral->ruralHealthUnit?->name ?: 'the receiving RHU';

        $this->notifications->notifyUsersOnce(
            $this->bhcUsers($referral),
            $lateArrival ? 'Patient Arrived After No-Show' : 'Referral Received by RHU',
            $lateArrival
                ? "{$patientName} arrived at {$rhuName} after being marked No-Show."
                : "{$rhuName} received the referral for {$patientName}.",
            $lateArrival ? 'referral_late_arrival' : 'referral_received',
            $referral->id,
            "/bhc/referrals/{$referral->tracking_id}",
            'referral',
            $referral->id
        );
    }

    private function notifyNoShow(Referral $referral): void
    {
        $referral->loadMissing('patient');
        $patientName = $referral->patient?->full_name ?: 'The referred patient';

        $this->notifications->notifyUsersOnce(
            $this->bhcUsers($referral),
            'Referral No-Show',
            "{$patientName} did not arrive at the RHU on the referral date.",
            'referral_no_show',
            $referral->id,
            "/bhc/referrals/{$referral->tracking_id}",
            'referral',
            $referral->id
        );
    }

    private function notifyCompleted(Referral $referral): void
    {
        $referral->loadMissing(['patient', 'ruralHealthUnit']);
        $patientName = $referral->patient?->full_name ?: 'The referred patient';
        $rhuName = $referral->ruralHealthUnit?->name ?: 'The receiving RHU';

        $this->notifications->notifyUsersOnce(
            $this->bhcUsers($referral),
            'RHU Feedback Available',
            "{$rhuName} submitted feedback for {$patientName}.",
            'referral_completed',
            $referral->id,
            "/bhc/referrals/{$referral->tracking_id}",
            'referral',
            $referral->id
        );
    }

    private function bhcUsers(Referral $referral)
    {
        return User::query()
            ->where('role', User::ROLE_BHW)
            ->where('barangay_health_center_id', $referral->barangay_health_center_id)
            ->where('status', User::STATUS_ACTIVE)
            ->get();
    }

    private function result(Referral $referral, bool $unchanged): array
    {
        return [
            'referral' => $referral->load(['patient', 'healthRecord', 'updates']),
            'status_unchanged' => $unchanged,
            'status' => Referral::normalizeWorkflowStatus($referral->status) ?? $referral->status,
        ];
    }
}
