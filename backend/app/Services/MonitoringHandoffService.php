<?php

namespace App\Services;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Household;
use App\Models\MonitoringHandoffRequest;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\RhuVisitQueueEntry;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
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
        // Referral-origin RHU visits may still Manage to BHC (referral return).
        // Ownership is not changed here; BHC verification decides assignment.
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
            // Idempotent: do not create a second open handoff for the same
            // patient + condition + receiving BHC on retry/finalize replay.
            $existing = MonitoringHandoffRequest::query()
                ->where('patient_id', $patient->id)
                ->where('patient_condition_id', $condition->id)
                ->where('receiving_barangay_health_center_id', $bhc->id)
                ->whereIn('status', [
                    MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED,
                    MonitoringHandoffRequest::STATUS_PENDING_REVIEW,
                    MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT,
                    MonitoringHandoffRequest::STATUS_MONITORING_ACTIVE,
                ])
                ->orderByDesc('id')
                ->first();
            if ($existing) {
                app(HandoffLaboratoryEvidence::class)->share(
                    $request, $existing, $entry['laboratoryEvidence'] ?? [],
                    ($entry['laboratoryEvidenceConfirmed'] ?? false) === true,
                );

                continue;
            }
            $sameIdentity = $this->facilityAccess->sameAssignedId(
                $patient->barangay_health_center_id,
                $bhc->id
            );
            $identitySource = $sameIdentity
                ? MonitoringHandoffRequest::IDENTITY_SOURCE_BHC_REFERRAL_RETURN
                : MonitoringHandoffRequest::IDENTITY_SOURCE_RHU_WALK_IN;
            // RHU-only patients stay unassigned until BHC staff verify identity.
            // Already-owned receiving-BHC patients skip re-registration.
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
                'identity_source' => $identitySource,
                'identity_resolution' => $sameIdentity
                    ? MonitoringHandoffRequest::IDENTITY_RESOLUTION_SAME_IDENTITY_AUTO
                    : null,
                'created_by' => $user->id,
            ]);
            app(HandoffLaboratoryEvidence::class)->share(
                $request, $handoff, $entry['laboratoryEvidence'] ?? [],
                ($entry['laboratoryEvidenceConfirmed'] ?? false) === true,
            );
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

    /**
     * Reuse an existing receiving-BHC patient identity. Different patient IDs
     * are never silently merged — only the shared source patient row is allowed.
     */
    public function link(Request $http, MonitoringHandoffRequest $handoff, int $linkedPatientId): MonitoringHandoffRequest
    {
        $user = $http->user();
        $this->assertBhcEncoder($user);
        $this->assertReceivingBhc($user, $handoff);

        return DB::transaction(function () use ($http, $handoff, $linkedPatientId, $user) {
            $locked = MonitoringHandoffRequest::query()->whereKey($handoff->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED) {
                throw ValidationException::withMessages([
                    'status' => ['Only a request that needs linkage can be linked.'],
                ]);
            }
            if ($locked->identity_resolution === MonitoringHandoffRequest::IDENTITY_RESOLUTION_NEEDS_REVIEW) {
                throw ValidationException::withMessages([
                    'identity_resolution' => ['This patient identity requires administrative review before linkage.'],
                ]);
            }
            if ((int) $linkedPatientId !== (int) $locked->patient_id) {
                throw ValidationException::withMessages([
                    'linked_patient_id' => ['A different patient record cannot be linked. Confirm the RHU source patient or escalate for identity review.'],
                ]);
            }
            $linked = Patient::query()->whereKey($linkedPatientId)->lockForUpdate()->firstOrFail();
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
            $locked->update([
                'linked_patient_id' => $linked->id,
                'status' => MonitoringHandoffRequest::STATUS_PENDING_REVIEW,
                'identity_resolution' => MonitoringHandoffRequest::IDENTITY_RESOLUTION_REUSED_EXISTING,
                'identity_resolution_note' => null,
                'reviewed_by' => $user->id,
                'reviewed_at' => now(),
            ]);
            $this->auditLogger->log(
                $http,
                'updated',
                'monitoring_handoff_requests',
                "Verified existing BHC identity for monitoring handoff {$locked->id} (patient {$linked->id})."
            );

            return $locked->fresh();
        });
    }

    /**
     * Assign the authoritative RHU source patient to the receiving BHC after
     * explicit staff verification. Never inserts a duplicate patients row.
     */
    public function registerSourceAtReceivingBhc(Request $http, MonitoringHandoffRequest $handoff): MonitoringHandoffRequest
    {
        $user = $http->user();
        $this->assertBhcEncoder($user);
        $this->assertReceivingBhc($user, $handoff);

        $conflictMessages = null;
        $result = DB::transaction(function () use ($http, $handoff, $user, &$conflictMessages) {
            $locked = MonitoringHandoffRequest::query()->whereKey($handoff->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED) {
                // Idempotent: already verified/registered for this request.
                if (
                    $locked->linked_patient_id
                    && (int) $locked->linked_patient_id === (int) $locked->patient_id
                    && in_array($locked->status, [
                        MonitoringHandoffRequest::STATUS_PENDING_REVIEW,
                        MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT,
                        MonitoringHandoffRequest::STATUS_MONITORING_ACTIVE,
                    ], true)
                ) {
                    return $locked->fresh();
                }
                throw ValidationException::withMessages([
                    'status' => ['Only a request that needs linkage can register the RHU source patient.'],
                ]);
            }
            if ($locked->identity_resolution === MonitoringHandoffRequest::IDENTITY_RESOLUTION_NEEDS_REVIEW) {
                throw ValidationException::withMessages([
                    'identity_resolution' => ['This patient identity requires administrative review before registration.'],
                ]);
            }

            $patient = Patient::query()->whereKey($locked->patient_id)->lockForUpdate()->firstOrFail();
            if ($patient->status !== 'active') {
                $this->markNeedsReview($locked, $user, 'Source patient is inactive.');
                $conflictMessages = [
                    'patient_id' => ['An inactive source patient cannot be registered at this BHC.'],
                ];

                return $locked->fresh();
            }
            if (! $this->hasSufficientIdentity($patient)) {
                $this->markNeedsReview($locked, $user, 'Source patient identity is incomplete.');
                $conflictMessages = [
                    'patient_id' => ['Patient information requires review before BHC registration.'],
                ];

                return $locked->fresh();
            }
            $receivingBhcId = (int) $locked->receiving_barangay_health_center_id;
            if ($patient->barangay_health_center_id !== null
                && ! $this->facilityAccess->sameAssignedId($patient->barangay_health_center_id, $receivingBhcId)) {
                $this->markNeedsReview($locked, $user, 'Source patient belongs to another BHC.');
                $conflictMessages = [
                    'patient_id' => ['Patient information requires review. Source belongs to another BHC.'],
                ];

                return $locked->fresh();
            }

            // Already assigned to this BHC (concurrent or prior path): reuse only.
            if ($this->facilityAccess->sameAssignedId($patient->barangay_health_center_id, $receivingBhcId)) {
                $locked->update([
                    'linked_patient_id' => $patient->id,
                    'status' => MonitoringHandoffRequest::STATUS_PENDING_REVIEW,
                    'identity_resolution' => MonitoringHandoffRequest::IDENTITY_RESOLUTION_REUSED_EXISTING,
                    'identity_resolution_note' => null,
                    'reviewed_by' => $user->id,
                    'reviewed_at' => now(),
                ]);
                $this->auditLogger->log(
                    $http,
                    'updated',
                    'monitoring_handoff_requests',
                    "Reused existing receiving-BHC assignment for monitoring handoff {$locked->id} (patient {$patient->id})."
                );

                return $locked->fresh();
            }

            // patients_household_facility_exclusive: household members must be
            // exclusively BHC-owned or RHU-owned. Assigning BHC while preserving
            // rural_health_unit_id requires leaving the RHU household first.
            $householdConflict = $this->detachRhuHouseholdIfNeeded($http, $patient, $user, $locked);
            if ($householdConflict !== null) {
                $conflictMessages = $householdConflict;

                return $locked->fresh();
            }

            // Do not catch QueryException here: on PostgreSQL a failed statement
            // aborts the transaction (25P02). Let DB::transaction roll back fully.
            $patient->update([
                'barangay_health_center_id' => $receivingBhcId,
            ]);

            $locked->update([
                'linked_patient_id' => $patient->id,
                'status' => MonitoringHandoffRequest::STATUS_PENDING_REVIEW,
                'identity_resolution' => MonitoringHandoffRequest::IDENTITY_RESOLUTION_REGISTERED_SOURCE,
                'identity_resolution_note' => null,
                'reviewed_by' => $user->id,
                'reviewed_at' => now(),
            ]);
            $this->auditLogger->log(
                $http,
                'updated',
                'monitoring_handoff_requests',
                "Registered RHU source patient {$patient->id} at BHC {$receivingBhcId} for monitoring handoff {$locked->id}."
            );
            $this->auditLogger->log(
                $http,
                'updated',
                'patients',
                "Assigned patient {$patient->id} to barangay health center {$receivingBhcId} via monitoring handoff verification."
            );

            return $locked->fresh();
        });

        // Persist needs_review before rejecting so failed verification stays auditable.
        if ($conflictMessages !== null) {
            throw ValidationException::withMessages($conflictMessages);
        }

        return $result;
    }

    public function flagIdentityReview(Request $http, MonitoringHandoffRequest $handoff, string $note): MonitoringHandoffRequest
    {
        $user = $http->user();
        $this->assertBhcEncoder($user);
        $this->assertReceivingBhc($user, $handoff);
        $note = trim($note);
        if ($note === '') {
            throw ValidationException::withMessages([
                'note' => ['A review note is required.'],
            ]);
        }

        return DB::transaction(function () use ($http, $handoff, $user, $note) {
            $locked = MonitoringHandoffRequest::query()->whereKey($handoff->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED) {
                throw ValidationException::withMessages([
                    'status' => ['Only a request that needs linkage can be escalated for review.'],
                ]);
            }
            $this->markNeedsReview($locked, $user, $note);
            $this->auditLogger->log(
                $http,
                'updated',
                'monitoring_handoff_requests',
                "Flagged monitoring handoff {$locked->id} for identity review."
            );

            return $locked->fresh();
        });
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
        if (! $handoff->linked_patient_id) {
            throw ValidationException::withMessages([
                'linked_patient_id' => ['Verify patient registration before accepting this request.'],
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

    public function decline(Request $http, MonitoringHandoffRequest $handoff, string $reason): MonitoringHandoffRequest
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
                'status' => ['This request can no longer be declined.'],
            ]);
        }
        $reason = trim($reason);
        if ($reason === '') {
            throw ValidationException::withMessages([
                'reason' => ['A reason is required.'],
            ]);
        }
        // Decline keeps the authorized receiving BHC. Historical redirected rows
        // remain readable; new redirects are no longer created.
        $handoff->update([
            'status' => MonitoringHandoffRequest::STATUS_DECLINED,
            'decline_reason' => $reason,
            'reviewed_by' => $user->id,
            'reviewed_at' => now(),
        ]);
        $this->auditLogger->log(
            $http,
            'updated',
            'monitoring_handoff_requests',
            "Declined monitoring handoff {$handoff->id}."
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

    private function hasSufficientIdentity(Patient $patient): bool
    {
        $first = trim((string) $patient->first_name);
        $last = trim((string) $patient->last_name);
        $sex = trim((string) $patient->sex);
        $birthdate = $patient->birthdate;

        return $first !== '' && $last !== '' && $sex !== '' && $birthdate !== null;
    }

    /**
     * Leave an RHU household when BHC assignment would violate exclusive
     * household facility ownership. Household heads with remaining members
     * require administrative review (head replacement) instead of silent detach.
     *
     * @return array<string, list<string>>|null
     */
    private function detachRhuHouseholdIfNeeded(
        Request $http,
        Patient $patient,
        User $user,
        MonitoringHandoffRequest $handoff,
    ): ?array {
        if (! $patient->household_id) {
            return null;
        }
        // Without an RHU id, assigning BHC alone already satisfies exclusive ownership.
        if ($patient->rural_health_unit_id === null) {
            return null;
        }

        $household = Household::query()->whereKey($patient->household_id)->lockForUpdate()->first();
        if (! $household) {
            $patient->household_id = null;
            $patient->relationship_to_household_head = null;
            $patient->save();

            return null;
        }

        $remaining = $household->members()->whereKeyNot($patient->id)->count();
        $isHead = (int) $household->head_patient_id === (int) $patient->id;
        if ($isHead && $remaining > 0) {
            $this->markNeedsReview(
                $handoff,
                $user,
                'Source patient is an RHU household head with other members; head replacement is required before BHC assignment.'
            );

            return [
                'patient_id' => ['Patient information requires review. This RHU household head has other members that must be reassigned first.'],
            ];
        }

        $patient->household_id = null;
        $patient->relationship_to_household_head = null;
        $patient->save();

        if ($isHead) {
            $household->head_patient_id = null;
            $household->archived_at = $household->archived_at ?? now();
            $household->version = (int) $household->version + 1;
            $household->save();
        } else {
            $household->version = (int) $household->version + 1;
            $household->save();
        }

        $this->auditLogger->log(
            $http,
            'updated',
            'households',
            "Detached patient {$patient->id} from RHU household {$household->id} before BHC monitoring registration."
        );

        return null;
    }

    private function markNeedsReview(MonitoringHandoffRequest $handoff, User $user, string $note): void
    {
        $handoff->update([
            'identity_resolution' => MonitoringHandoffRequest::IDENTITY_RESOLUTION_NEEDS_REVIEW,
            'identity_resolution_note' => mb_substr(trim($note), 0, 500),
            'reviewed_by' => $user->id,
            'reviewed_at' => now(),
        ]);
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
