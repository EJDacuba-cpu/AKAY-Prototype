<?php

namespace App\Services;

use App\Exceptions\ReferralSubmissionBlockedException;
use App\Models\HealthRecord;
use App\Models\Patient;
use Illuminate\Http\Request;

/** Runs inside the official record transaction, using the normal routing and availability gates. */
class ConditionCardReferrals
{
    public function __construct(
        private readonly ReferralCreationService $referrals,
        private readonly ReferralRoutingService $routing,
        private readonly ReferralHoldService $holds,
    ) {}

    public function create(Request $request, Patient $patient, HealthRecord $record, string $submissionKey): void
    {
        $outcomes = [];
        foreach ($record->diagnoses ?? [] as $index => $entry) {
            if (($entry['clinicalOutcome'] ?? null) !== 'refer_to_rhu') {
                continue;
            }
            $data = [
                'rural_health_unit_id' => (int) $entry['referral']['receivingRhuId'],
                'urgency_level' => $entry['referral']['urgencyLevel'],
                'reason_for_referral' => $entry['referral']['reasonForReferral'],
                'initial_diagnosis' => $entry['name'],
                'chief_complaint' => $record->chief_complaint,
                'initial_action_taken' => $record->treatment_notes,
                'referring_practitioner' => $record->monitoring_data['attendingStaff']
                    ?? $record->monitoring_data['attending_staff']
                    ?? $request->user()->name,
                'client_submission_id' => 'condition:'.hash('sha256', $submissionKey.':'.$entry['id']),
            ];
            try {
                $referral = $this->referrals->create($request, $patient, $data, $record);
                $outcomes[] = ['entryId' => $entry['id'], 'referralId' => $referral->id, 'trackingId' => $referral->tracking_id];
            } catch (ReferralSubmissionBlockedException $exception) {
                if ($exception->blockCode !== 'NO_PROVIDER_AVAILABLE') {
                    throw $exception;
                }
                $route = $this->routing->resolveForBhc($request->user(), $data['rural_health_unit_id']);
                $hold = $this->holds->recordBlockedAttempt($request->user(), $patient, $route['bhc']->id, $route['rhu'], [...$data, 'health_record_id' => $record->id]);
                $outcomes[] = ['entryId' => $entry['id'], 'holdId' => $hold->id, 'pendingReferral' => $data];
            } catch (\Illuminate\Validation\ValidationException $exception) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    "diagnoses.$index.referral.receivingRhuId" => collect($exception->errors())->flatten()->first(),
                ]);
            }
        }
        if ($outcomes !== []) {
            $record->update(['monitoring_data' => [...($record->monitoring_data ?? []), 'conditionReferralOutcomes' => $outcomes]]);
        }
    }
}
