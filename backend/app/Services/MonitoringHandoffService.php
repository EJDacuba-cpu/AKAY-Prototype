<?php

namespace App\Services;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\MonitoringHandoffRequest;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\RhuVisitQueueEntry;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class MonitoringHandoffService
{
    public function __construct(
        private readonly ClinicalRegistry $clinicalRegistry,
        private readonly FacilityAccessService $facilityAccess,
        private readonly AuditLogger $auditLogger,
    ) {}

    /**
     * @param  array<int, array<string, mixed>>  $diagnoses
     * @param  Collection<int, PatientCondition>  $confirmed
     */
    public function createFromFinalize(
        Request $request,
        Patient $patient,
        HealthRecord $record,
        array $diagnoses,
        Collection $confirmed,
        ?RhuVisitQueueEntry $visit,
    ): void {
        if ($visit?->source === RhuVisitQueueEntry::SOURCE_REFERRAL) {
            return;
        }
        $user = $request->user();
        $rhuId = (int) $user->rural_health_unit_id;
        foreach ($diagnoses as $entry) {
            if (! is_array($entry)) {
                continue;
            }
            if (! $this->isManageToBhc($entry)) {
                continue;
            }
            $name = trim((string) ($entry['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $recommendation = trim((string) ($entry['monitoringRecommendation'] ?? $entry['monitoring_recommendation'] ?? ''));
            $receivingBhcId = (int) ($entry['receivingBhcId'] ?? $entry['receiving_bhc_id'] ?? 0);
            $bhc = $this->catchmentBhc($rhuId, $receivingBhcId);
            if ($bhc === null || $recommendation === '') {
                throw ValidationException::withMessages([
                    'diagnoses' => ['Manage to BHC needs a catchment Barangay Health Center and a monitoring recommendation.'],
                ]);
            }
            $condition = $this->conditionForDiagnosis($patient, $name, $confirmed);
            if ($condition === null || ! in_array($condition->status, PatientCondition::MONITORABLE_STATUSES, true)) {
                throw ValidationException::withMessages([
                    'diagnoses' => ['Only an Active or Controlled condition can be managed to BHC.'],
                ]);
            }
            $sameIdentity = $this->facilityAccess->sameAssignedId(
                $patient->barangay_health_center_id,
                $bhc->id
            );
            $handoff = MonitoringHandoffRequest::create([
                'patient_id' => $patient->id,
                'linked_patient_id' => $sameIdentity ? $patient->id : null,
                'patient_condition_id' => $condition->id,
                'health_record_id' => $record->id,
                'sending_rural_health_unit_id' => $rhuId,
                'receiving_barangay_health_center_id' => $bhc->id,
                'recommendation' => $recommendation,
                'status' => $sameIdentity
                    ? MonitoringHandoffRequest::STATUS_PENDING_REVIEW
                    : MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED,
                'created_by' => $user->id,
            ]);
            $this->auditLogger->log(
                $request,
                'created',
                'monitoring_handoff_requests',
                "Created monitoring handoff {$handoff->id} for condition {$condition->id}."
            );
        }
    }

    /**
     * @return list<BarangayHealthCenter>
     */
    public function catchmentBhcs(User $user): array
    {
        abort_unless($user->isRhu() && $this->facilityAccess->hasValidFacilityAssignment($user), 403, FacilityAccessService::DENIED_MESSAGE);

        return BarangayHealthCenter::query()
            ->where('rural_health_unit_id', $user->rural_health_unit_id)
            ->where('status', 'active')
            ->orderBy('name')
            ->get()
            ->all();
    }

    /**
     * @return Collection<int, MonitoringHandoffRequest>
     */
    public function listForBhc(User $user): Collection
    {
        $this->assertBhcViewer($user);

        return MonitoringHandoffRequest::query()
            ->with([
                'patient',
                'linkedPatient',
                'patientCondition',
                'sendingRuralHealthUnit',
                'receivingBarangayHealthCenter',
            ])
            ->where('receiving_barangay_health_center_id', $user->barangay_health_center_id)
            ->orderByDesc('id')
            ->get();
    }

    public function findForBhc(User $user, int $id): MonitoringHandoffRequest
    {
        $this->assertBhcViewer($user);
        $request = MonitoringHandoffRequest::query()
            ->with([
                'patient',
                'linkedPatient',
                'patientCondition',
                'healthRecord',
                'sendingRuralHealthUnit',
                'receivingBarangayHealthCenter',
                'redirectedToBhc',
                'createdBy',
                'reviewedBy',
            ])
            ->whereKey($id)
            ->firstOrFail();
        abort_unless(
            $this->facilityAccess->sameAssignedId(
                $request->receiving_barangay_health_center_id,
                $user->barangay_health_center_id
            ),
            403,
            FacilityAccessService::DENIED_MESSAGE
        );

        return $request;
    }

    public function link(Request $http, MonitoringHandoffRequest $handoff, int $linkedPatientId): MonitoringHandoffRequest
    {
        $user = $http->user();
        $this->assertBhcEncoder($user);
        $this->assertReceivingBhc($user, $handoff);
        if ($handoff->status !== MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED) {
            throw ValidationException::withMessages([
                'status' => ['Only a request that needs linkage can be linked.'],
            ]);
        }
        $linked = Patient::query()->whereKey($linkedPatientId)->firstOrFail();
        abort_unless(
            $this->facilityAccess->sameAssignedId($linked->barangay_health_center_id, $user->barangay_health_center_id),
            403,
            FacilityAccessService::DENIED_MESSAGE
        );
        if ($linked->status === 'inactive') {
            throw ValidationException::withMessages([
                'linked_patient_id' => ['An inactive patient cannot be linked.'],
            ]);
        }
        $handoff->update([
            'linked_patient_id' => $linked->id,
            'status' => MonitoringHandoffRequest::STATUS_PENDING_REVIEW,
            'reviewed_by' => $user->id,
            'reviewed_at' => now(),
        ]);
        $this->auditLogger->log($http, 'updated', 'monitoring_handoff_requests', "Linked monitoring handoff {$handoff->id} to patient {$linked->id}.");

        return $handoff->fresh();
    }

    public function accept(Request $http, MonitoringHandoffRequest $handoff): MonitoringHandoffRequest
    {
        $user = $http->user();
        $this->assertBhcEncoder($user);
        $this->assertReceivingBhc($user, $handoff);
        if ($handoff->status !== MonitoringHandoffRequest::STATUS_PENDING_REVIEW) {
            throw ValidationException::withMessages([
                'status' => ['Only a pending request can be accepted.'],
            ]);
        }
        $handoff->update([
            'status' => MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT,
            'reviewed_by' => $user->id,
            'reviewed_at' => now(),
        ]);
        $this->auditLogger->log($http, 'updated', 'monitoring_handoff_requests', "Accepted monitoring handoff {$handoff->id}.");

        return $handoff->fresh();
    }

    public function decline(Request $http, MonitoringHandoffRequest $handoff, string $reason, ?int $redirectBhcId): MonitoringHandoffRequest
    {
        $user = $http->user();
        $this->assertBhcEncoder($user);
        $this->assertReceivingBhc($user, $handoff);
        if (! in_array($handoff->status, [
            MonitoringHandoffRequest::STATUS_PENDING_REVIEW,
            MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED,
            MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT,
        ], true)) {
            throw ValidationException::withMessages([
                'status' => ['This request can no longer be declined or redirected.'],
            ]);
        }
        $reason = trim($reason);
        if ($reason === '') {
            throw ValidationException::withMessages([
                'reason' => ['A reason is required.'],
            ]);
        }
        $handoff->loadMissing('patient');
        $redirect = null;
        if ($redirectBhcId) {
            $redirect = $this->catchmentBhc(
                (int) $handoff->sending_rural_health_unit_id,
                $redirectBhcId
            );
            if ($redirect === null || (int) $redirect->id === (int) $handoff->receiving_barangay_health_center_id) {
                throw ValidationException::withMessages([
                    'redirected_to_bhc_id' => ['Choose a different catchment Barangay Health Center of this RHU.'],
                ]);
            }
            $sameIdentity = $this->facilityAccess->sameAssignedId(
                $handoff->patient->barangay_health_center_id,
                $redirect->id
            );
            $copy = MonitoringHandoffRequest::create([
                'patient_id' => $handoff->patient_id,
                'linked_patient_id' => $sameIdentity ? $handoff->patient_id : null,
                'patient_condition_id' => $handoff->patient_condition_id,
                'health_record_id' => $handoff->health_record_id,
                'sending_rural_health_unit_id' => $handoff->sending_rural_health_unit_id,
                'receiving_barangay_health_center_id' => $redirect->id,
                'recommendation' => $handoff->recommendation,
                'status' => $sameIdentity
                    ? MonitoringHandoffRequest::STATUS_PENDING_REVIEW
                    : MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED,
                'created_by' => $handoff->created_by,
            ]);
            $this->auditLogger->log($http, 'created', 'monitoring_handoff_requests', "Redirected monitoring handoff {$handoff->id} as {$copy->id}.");
        }
        $handoff->update([
            'status' => $redirect ? MonitoringHandoffRequest::STATUS_REDIRECTED : MonitoringHandoffRequest::STATUS_DECLINED,
            'decline_reason' => $reason,
            'redirected_to_bhc_id' => $redirect?->id,
            'reviewed_by' => $user->id,
            'reviewed_at' => now(),
        ]);
        $this->auditLogger->log(
            $http,
            'updated',
            'monitoring_handoff_requests',
            ($redirect ? 'Redirected' : 'Declined')." monitoring handoff {$handoff->id}."
        );

        return $handoff->fresh();
    }

    public function startableHandoffFor(Patient $patient, PatientCondition $condition, User $user): ?MonitoringHandoffRequest
    {
        if (! $user->isBhc() || ! $user->barangay_health_center_id) {
            return null;
        }

        return MonitoringHandoffRequest::query()
            ->where('receiving_barangay_health_center_id', $user->barangay_health_center_id)
            ->where('patient_condition_id', $condition->id)
            ->where('linked_patient_id', $patient->id)
            ->whereIn('status', MonitoringHandoffRequest::STARTABLE_STATUSES)
            ->orderBy('id')
            ->first();
    }

    /**
     * RHU-confirmed conditions the receiving BHC may see through a verified
     * patient-linkage handoff, without copying those rows onto this patient.
     *
     * @return Collection<int, PatientCondition>
     */
    public function linkedConditionsFor(Patient $patient, User $user): Collection
    {
        if (! $user->isBhc() || ! $user->barangay_health_center_id) {
            return collect();
        }
        $ids = MonitoringHandoffRequest::query()
            ->where('receiving_barangay_health_center_id', $user->barangay_health_center_id)
            ->where('linked_patient_id', $patient->id)
            ->whereIn('status', [
                MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT,
                MonitoringHandoffRequest::STATUS_MONITORING_ACTIVE,
            ])
            ->pluck('patient_condition_id')
            ->filter()
            ->unique()
            ->values();
        if ($ids->isEmpty()) {
            return collect();
        }

        return PatientCondition::query()
            ->with([
                'confirmedBy:id,name',
                'events' => fn ($q) => $q->with('changedBy:id,name')->orderByDesc('changed_at')->orderByDesc('id'),
                'monitorings' => fn ($q) => $q->orderByDesc('id'),
            ])
            ->whereIn('id', $ids)
            ->orderByDesc('confirmed_at')
            ->orderByDesc('id')
            ->get();
    }

    public function markMonitoringActive(Patient $patient, PatientCondition $condition, User $user): void
    {
        if (! $user->isBhc() || ! $user->barangay_health_center_id) {
            return;
        }
        $this->matchingRequests($patient, $condition, $user)
            ->where('status', MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT)
            ->each(function (MonitoringHandoffRequest $handoff): void {
                $handoff->update(['status' => MonitoringHandoffRequest::STATUS_MONITORING_ACTIVE]);
            });
    }

    public function assertStartAllowed(Patient $patient, PatientCondition $condition, User $user, int $index): void
    {
        if (! $user->isBhc() || ! $user->barangay_health_center_id) {
            return;
        }
        $requests = $this->matchingRequests($patient, $condition, $user);
        if ($requests->isEmpty()) {
            return;
        }
        if ($requests->contains(fn (MonitoringHandoffRequest $handoff) => in_array($handoff->status, MonitoringHandoffRequest::STARTABLE_STATUSES, true))) {
            return;
        }
        throw ValidationException::withMessages([
            "care_plan.start_monitoring_condition_ids.{$index}" => 'BHC monitoring can start only after this request is accepted.',
        ]);
    }

    /**
     * @return Collection<int, MonitoringHandoffRequest>
     */
    private function matchingRequests(Patient $patient, PatientCondition $condition, User $user): Collection
    {
        return MonitoringHandoffRequest::query()
            ->where('receiving_barangay_health_center_id', $user->barangay_health_center_id)
            ->where(function ($query) use ($patient, $condition): void {
                $query->where('patient_condition_id', $condition->id)
                    ->orWhere(function ($inner) use ($patient, $condition): void {
                        $inner->where('linked_patient_id', $patient->id)
                            ->whereHas('patientCondition', fn ($conditions) => $conditions
                                ->where('condition_identity', $condition->condition_identity));
                    });
            })
            ->get();
    }

    /**
     * @param  Collection<int, PatientCondition>  $confirmed
     */
    private function conditionForDiagnosis(Patient $patient, string $name, Collection $confirmed): ?PatientCondition
    {
        $match = $this->clinicalRegistry->matchCondition($name);
        $identity = $this->clinicalRegistry->conditionIdentity($match['key'] ?? null, $name);
        $fromConfirm = $confirmed->first(fn (PatientCondition $condition) => $condition->condition_identity === $identity);
        if ($fromConfirm) {
            return $fromConfirm;
        }

        return PatientCondition::query()
            ->where('patient_id', $patient->id)
            ->where('condition_identity', $identity)
            ->open()
            ->first();
    }

    /**
     * @param  array<string, mixed>  $entry
     */
    private function isManageToBhc(array $entry): bool
    {
        $action = (string) ($entry['nextAction'] ?? $entry['next_action'] ?? '');

        return $action === 'manage_to_bhc'
            || filter_var($entry['manageToBhc'] ?? $entry['manage_to_bhc'] ?? false, FILTER_VALIDATE_BOOLEAN);
    }

    private function catchmentBhc(int $rhuId, int $bhcId): ?BarangayHealthCenter
    {
        if ($bhcId <= 0) {
            return null;
        }

        return BarangayHealthCenter::query()
            ->whereKey($bhcId)
            ->where('rural_health_unit_id', $rhuId)
            ->where('status', 'active')
            ->first();
    }

    private function assertBhcViewer(User $user): void
    {
        abort_unless($user->isBhc() && $this->facilityAccess->hasValidFacilityAssignment($user), 403, FacilityAccessService::DENIED_MESSAGE);
        abort_unless(
            ActionPermissions::allows($user, 'consultations.encode')
            || ActionPermissions::allows($user, 'clinical.history'),
            403,
            'Your current facility assignment does not permit this action.'
        );
    }

    private function assertBhcEncoder(User $user): void
    {
        abort_unless($user->isBhc() && $this->facilityAccess->hasValidFacilityAssignment($user), 403, FacilityAccessService::DENIED_MESSAGE);
        ActionPermissions::ensure($user, 'consultations.encode');
    }

    private function assertReceivingBhc(User $user, MonitoringHandoffRequest $handoff): void
    {
        abort_unless(
            $this->facilityAccess->sameAssignedId(
                $handoff->receiving_barangay_health_center_id,
                $user->barangay_health_center_id
            ),
            403,
            FacilityAccessService::DENIED_MESSAGE
        );
    }
}
