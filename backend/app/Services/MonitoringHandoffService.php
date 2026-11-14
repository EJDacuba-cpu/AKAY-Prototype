<?php

namespace App\Services;

use App\Models\BarangayHealthCenter;
use App\Models\FacilityAssignment;
use App\Models\HealthRecord;
use App\Models\Household;
use App\Models\MonitoringHandoffRequest;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\RhuVisitQueueEntry;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
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
                'handoff_kind' => MonitoringHandoffRequest::HANDOFF_KIND_CONDITION,
                'service_key' => null,
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
     * Service Manage to BHC: creates Monitoring Requests without PatientConditions.
     *
     * @param  array<int, array<string, mixed>>  $serviceHandoffs
     */
    public function createServiceHandoffsFromFinalize(
        Request $request,
        Patient $patient,
        HealthRecord $record,
        array $serviceHandoffs,
        ?RhuVisitQueueEntry $visit,
    ): void {
        $user = $request->user();
        $rhuId = (int) $user->rural_health_unit_id;
        foreach ($serviceHandoffs as $index => $entry) {
            if (! is_array($entry)) {
                continue;
            }
            $program = trim((string) ($entry['program'] ?? ''));
            if (! in_array($program, MonitoringHandoffRequest::SERVICE_KEYS, true)) {
                throw ValidationException::withMessages([
                    "care_plan.service_handoffs.{$index}.program" => ['Choose a valid health service for Manage to BHC.'],
                ]);
            }
            $recommendation = trim((string) ($entry['monitoring_recommendation'] ?? $entry['monitoringRecommendation'] ?? ''));
            $receivingBhcId = (int) ($entry['receiving_bhc_id'] ?? $entry['receivingBhcId'] ?? 0);
            $bhc = $this->catchmentBhc($rhuId, $receivingBhcId);
            if ($bhc === null || $recommendation === '') {
                throw ValidationException::withMessages([
                    "care_plan.service_handoffs.{$index}" => ['Manage to BHC needs a catchment Barangay Health Center and a monitoring recommendation.'],
                ]);
            }
            $existing = MonitoringHandoffRequest::query()
                ->where('patient_id', $patient->id)
                ->where('handoff_kind', MonitoringHandoffRequest::HANDOFF_KIND_SERVICE)
                ->where('service_key', $program)
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
                    $request,
                    $existing,
                    $entry['laboratoryEvidence'] ?? $entry['laboratory_evidence'] ?? [],
                    ($entry['laboratoryEvidenceConfirmed'] ?? $entry['laboratory_evidence_confirmed'] ?? false) === true,
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
            $handoff = MonitoringHandoffRequest::create([
                'patient_id' => $patient->id,
                'linked_patient_id' => $sameIdentity ? $patient->id : null,
                'handoff_kind' => MonitoringHandoffRequest::HANDOFF_KIND_SERVICE,
                'service_key' => $program,
                'patient_condition_id' => null,
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
                $request,
                $handoff,
                $entry['laboratoryEvidence'] ?? $entry['laboratory_evidence'] ?? [],
                ($entry['laboratoryEvidenceConfirmed'] ?? $entry['laboratory_evidence_confirmed'] ?? false) === true,
            );
            $this->auditLogger->log(
                $request,
                'created',
                'monitoring_handoff_requests',
                "Created service monitoring handoff {$handoff->id} for {$program}."
            );
        }
    }

    /**
     * Mark accepted service handoffs active when BHC records a matching program visit.
     *
     * @param  list<string>  $selectedPrograms
     */
    public function markServiceMonitoringActive(Patient $patient, User $user, array $selectedPrograms): void
    {
        if (! $user->isBhc() || ! $user->barangay_health_center_id || $selectedPrograms === []) {
            return;
        }
        $programs = array_values(array_intersect(
            MonitoringHandoffRequest::SERVICE_KEYS,
            array_map('strval', $selectedPrograms)
        ));
        if ($programs === []) {
            return;
        }
        MonitoringHandoffRequest::query()
            ->where('receiving_barangay_health_center_id', $user->barangay_health_center_id)
            ->where('handoff_kind', MonitoringHandoffRequest::HANDOFF_KIND_SERVICE)
            ->whereIn('service_key', $programs)
            ->where('linked_patient_id', $patient->id)
            ->where('status', MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT)
            ->each(function (MonitoringHandoffRequest $handoff): void {
                $handoff->update(['status' => MonitoringHandoffRequest::STATUS_MONITORING_ACTIVE]);
            });
    }

    /**
     * Active catchment BHCs that have at least one available account
     * (active home user or current facility assignment). Used by diagnosis and
     * service Manage to BHC receiving-BHC selectors.
     *
     * @return list<BarangayHealthCenter>
     */
    public function catchmentBhcs(User $user): array
    {
        abort_unless($user->isRhu() && $this->facilityAccess->hasValidFacilityAssignment($user), 403, FacilityAccessService::DENIED_MESSAGE);

        $staffedIds = $this->staffedCatchmentBhcIds();
        if ($staffedIds === []) {
            return [];
        }

        return BarangayHealthCenter::query()
            ->where('rural_health_unit_id', $user->rural_health_unit_id)
            ->where('status', 'active')
            ->whereIn('id', $staffedIds)
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
     * Verify receiving-BHC patient identity for a monitoring handoff.
     * Same-ID reuse remains the default. Different IDs require an explicit
     * staff confirmation after a name+birthdate+sex potential match — records
     * are never merged and primary keys are never changed.
     */
    public function link(
        Request $http,
        MonitoringHandoffRequest $handoff,
        int $linkedPatientId,
        bool $identityConfirmed = false,
        ?string $verificationEvidence = null,
    ): MonitoringHandoffRequest {
        $user = $http->user();
        $this->assertBhcEncoder($user);
        $this->assertReceivingBhc($user, $handoff);

        return DB::transaction(function () use ($http, $handoff, $linkedPatientId, $identityConfirmed, $verificationEvidence, $user) {
            $locked = MonitoringHandoffRequest::query()->whereKey($handoff->id)->lockForUpdate()->firstOrFail();

            // Idempotent: already verified to the same destination.
            if (
                (int) $locked->linked_patient_id === $linkedPatientId
                && in_array($locked->status, [
                    MonitoringHandoffRequest::STATUS_PENDING_REVIEW,
                    MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT,
                    MonitoringHandoffRequest::STATUS_MONITORING_ACTIVE,
                ], true)
            ) {
                return $locked->fresh();
            }

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

            $source = Patient::query()->whereKey($locked->patient_id)->lockForUpdate()->firstOrFail();
            $sameRecord = (int) $linked->id === (int) $source->id;
            $evidence = mb_substr(trim((string) $verificationEvidence), 0, 500);

            if (! $sameRecord) {
                if (! $identityConfirmed) {
                    throw ValidationException::withMessages([
                        'identity_confirmed' => ['Confirm that the selected BHC registration is the same person as the RHU source patient before linking.'],
                    ]);
                }
                if (! $this->isPotentialDemographicMatch($source, $linked)) {
                    throw ValidationException::withMessages([
                        'linked_patient_id' => ['Selected BHC registration demographics conflict with the RHU source patient. Escalate for identity review.'],
                    ]);
                }
                $this->assertNoConflictingIdentityAssociation($locked, $linked->id);
            }

            $locked->update([
                'linked_patient_id' => $linked->id,
                'status' => MonitoringHandoffRequest::STATUS_PENDING_REVIEW,
                'identity_resolution' => $sameRecord
                    ? MonitoringHandoffRequest::IDENTITY_RESOLUTION_REUSED_EXISTING
                    : MonitoringHandoffRequest::IDENTITY_RESOLUTION_VERIFIED_CROSS_RECORD,
                'identity_resolution_note' => $sameRecord ? null : ($evidence !== '' ? $evidence : null),
                'reviewed_by' => $user->id,
                'reviewed_at' => now(),
            ]);
            $this->auditLogger->log(
                $http,
                'updated',
                'monitoring_handoff_requests',
                $sameRecord
                    ? "Verified existing BHC identity for monitoring handoff {$locked->id} (patient {$linked->id})."
                    : "Verified cross-record linkage for monitoring handoff {$locked->id} (source patient {$source->id} → BHC patient {$linked->id})."
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

    /**
     * Clear a needs_review flag so authorized BHC staff can resume verification.
     * Does not invent a patient link; staff must verify again deliberately.
     */
    public function resolveIdentityReview(Request $http, MonitoringHandoffRequest $handoff, string $note): MonitoringHandoffRequest
    {
        $user = $http->user();
        $this->assertBhcEncoder($user);
        $this->assertReceivingBhc($user, $handoff);
        $note = trim($note);
        if ($note === '') {
            throw ValidationException::withMessages([
                'note' => ['A resolution note is required.'],
            ]);
        }

        return DB::transaction(function () use ($http, $handoff, $user, $note) {
            $locked = MonitoringHandoffRequest::query()->whereKey($handoff->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED) {
                throw ValidationException::withMessages([
                    'status' => ['Only a request that needs linkage can clear identity review.'],
                ]);
            }
            if ($locked->identity_resolution !== MonitoringHandoffRequest::IDENTITY_RESOLUTION_NEEDS_REVIEW) {
                throw ValidationException::withMessages([
                    'identity_resolution' => ['This request is not flagged for identity review.'],
                ]);
            }
            $locked->update([
                'identity_resolution' => null,
                'identity_resolution_note' => mb_substr($note, 0, 500),
                'linked_patient_id' => null,
                'reviewed_by' => $user->id,
                'reviewed_at' => now(),
            ]);
            $this->auditLogger->log(
                $http,
                'updated',
                'monitoring_handoff_requests',
                "Cleared identity review for monitoring handoff {$locked->id}: {$note}"
            );

            return $locked->fresh();
        });
    }

    /**
     * Undo an incorrect pending verification without deleting historical audit
     * or reassigning medical records. Returns the request to linkage_needed.
     */
    public function correctIdentityLink(Request $http, MonitoringHandoffRequest $handoff, string $note): MonitoringHandoffRequest
    {
        $user = $http->user();
        $this->assertBhcEncoder($user);
        $this->assertReceivingBhc($user, $handoff);
        $note = trim($note);
        if ($note === '') {
            throw ValidationException::withMessages([
                'note' => ['A correction note is required.'],
            ]);
        }

        return DB::transaction(function () use ($http, $handoff, $user, $note) {
            $locked = MonitoringHandoffRequest::query()->whereKey($handoff->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== MonitoringHandoffRequest::STATUS_PENDING_REVIEW) {
                throw ValidationException::withMessages([
                    'status' => ['Only a pending verified request can correct its patient linkage.'],
                ]);
            }
            $previousLinked = $locked->linked_patient_id;
            $locked->update([
                'linked_patient_id' => null,
                'status' => MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED,
                'identity_resolution' => MonitoringHandoffRequest::IDENTITY_RESOLUTION_NEEDS_REVIEW,
                'identity_resolution_note' => mb_substr($note, 0, 500),
                'reviewed_by' => $user->id,
                'reviewed_at' => now(),
            ]);
            $this->auditLogger->log(
                $http,
                'updated',
                'monitoring_handoff_requests',
                "Corrected identity link for monitoring handoff {$locked->id} (cleared linked patient {$previousLinked}): {$note}"
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

    /**
     * Read-only RHU clinical slice authorized for accepted/active handoffs linked
     * to this BHC patient. Does not grant unrestricted RHU history access.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function sharedClinicalFor(Patient $patient, User $user): Collection
    {
        $this->assertBhcViewer($user);
        abort_unless(
            $this->facilityAccess->sameAssignedId($patient->barangay_health_center_id, $user->barangay_health_center_id),
            403,
            FacilityAccessService::DENIED_MESSAGE
        );

        $handoffs = MonitoringHandoffRequest::query()
            ->with([
                'patientCondition',
                'sendingRuralHealthUnit:id,name',
                'healthRecord',
                'linkedPatient',
            ])
            ->where('receiving_barangay_health_center_id', $user->barangay_health_center_id)
            ->where('linked_patient_id', $patient->id)
            ->whereIn('status', [
                MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT,
                MonitoringHandoffRequest::STATUS_MONITORING_ACTIVE,
            ])
            ->orderByDesc('id')
            ->get();

        $evidence = app(HandoffLaboratoryEvidence::class);

        return $handoffs->map(function (MonitoringHandoffRequest $handoff) use ($user, $evidence) {
            $evidence->authorizeReceiver($user, $handoff);
            $record = $handoff->healthRecord;

            return [
                'handoff_id' => $handoff->id,
                'status' => $handoff->status,
                'source_facility' => [
                    'id' => $handoff->sending_rural_health_unit_id,
                    'name' => $handoff->sendingRuralHealthUnit?->name,
                ],
                'source_patient_id' => $handoff->patient_id,
                'linked_patient_id' => $handoff->linked_patient_id,
                'consultation_date' => $record?->date_recorded?->toDateString(),
                'chief_complaint' => $record?->chief_complaint,
                'clinical_assessment' => $record?->assessment_notes,
                'physical_exam' => $record?->physical_exam,
                'vital_signs' => is_array($record?->vital_signs) ? $record->vital_signs : null,
                'condition' => [
                    'id' => $handoff->patient_condition_id,
                    'name' => $handoff->patientCondition?->condition_name,
                    'status' => $handoff->patientCondition?->status,
                ],
                'recommendation' => $handoff->recommendation,
                'laboratory_evidence' => ActionPermissions::allows($user, 'clinical.history')
                    ? $evidence->present($handoff)
                    : [],
                'prescriptions' => ActionPermissions::allows($user, 'clinical.history')
                    ? $this->prescriptionSummaries($handoff)
                    : [],
                'follow_up_recommendations' => $handoff->recommendation,
                'health_record_id' => $handoff->health_record_id,
                'identity_resolution' => $handoff->identity_resolution,
                'read_only' => true,
            ];
        })->values();
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

        $staffedIds = $this->staffedCatchmentBhcIds();
        if (! in_array($bhcId, $staffedIds, true)) {
            return null;
        }

        return BarangayHealthCenter::query()
            ->whereKey($bhcId)
            ->where('rural_health_unit_id', $rhuId)
            ->where('status', 'active')
            ->first();
    }

    /**
     * Same staffing rule as AdminDashboardService attention: active home BHC
     * users plus current (non-revoked, in-window) facility assignments.
     *
     * @return list<int>
     */
    private function staffedCatchmentBhcIds(): array
    {
        $today = now()->toDateString();
        $home = User::query()
            ->where('status', User::STATUS_ACTIVE)
            ->whereNotNull('barangay_health_center_id')
            ->distinct()
            ->pluck('barangay_health_center_id');

        $assigned = FacilityAssignment::query()
            ->whereNull('revoked_at')
            ->whereNotNull('barangay_health_center_id')
            ->whereNotNull('starts_on')
            ->whereDate('starts_on', '<=', $today)
            ->where(fn (Builder $q) => $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', $today))
            ->whereHas('user', fn (Builder $user) => $user->where('status', User::STATUS_ACTIVE))
            ->distinct()
            ->pluck('barangay_health_center_id');

        return $home->merge($assigned)->unique()->map(fn ($id) => (int) $id)->values()->all();
    }

    private function hasSufficientIdentity(Patient $patient): bool
    {
        $first = trim((string) $patient->first_name);
        $last = trim((string) $patient->last_name);
        $sex = trim((string) $patient->sex);
        $birthdate = $patient->birthdate;

        return $first !== '' && $last !== '' && $sex !== '' && $birthdate !== null;
    }

    private function isPotentialDemographicMatch(Patient $source, Patient $candidate): bool
    {
        $sourceName = $this->normalizedFullName($source);
        $candidateName = $this->normalizedFullName($candidate);
        $sourceDob = $this->normalizedBirthdate($source);
        $candidateDob = $this->normalizedBirthdate($candidate);
        $sourceSex = mb_strtolower(trim((string) $source->sex));
        $candidateSex = mb_strtolower(trim((string) $candidate->sex));

        return $sourceName !== ''
            && $candidateName !== ''
            && $sourceName === $candidateName
            && $sourceDob !== null
            && $candidateDob !== null
            && $sourceDob === $candidateDob
            && $sourceSex !== ''
            && $candidateSex !== ''
            && $sourceSex === $candidateSex;
    }

    private function normalizedFullName(Patient $patient): string
    {
        $parts = [
            mb_strtolower(trim((string) $patient->first_name)),
            mb_strtolower(trim((string) $patient->middle_name)),
            mb_strtolower(trim((string) $patient->last_name)),
            mb_strtolower(trim((string) $patient->suffix)),
        ];
        $joined = preg_replace('/\s+/u', ' ', implode(' ', array_filter($parts, fn ($part) => $part !== ''))) ?? '';

        return trim($joined);
    }

    private function normalizedBirthdate(Patient $patient): ?string
    {
        if ($patient->birthdate === null) {
            return null;
        }

        return $patient->birthdate->format('Y-m-d');
    }

    private function assertNoConflictingIdentityAssociation(MonitoringHandoffRequest $handoff, int $destinationPatientId): void
    {
        $conflict = MonitoringHandoffRequest::query()
            ->where('receiving_barangay_health_center_id', $handoff->receiving_barangay_health_center_id)
            ->where('linked_patient_id', $destinationPatientId)
            ->where('patient_id', '!=', $handoff->patient_id)
            ->whereIn('status', [
                MonitoringHandoffRequest::STATUS_PENDING_REVIEW,
                MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT,
                MonitoringHandoffRequest::STATUS_MONITORING_ACTIVE,
            ])
            ->lockForUpdate()
            ->exists();
        if ($conflict) {
            throw ValidationException::withMessages([
                'linked_patient_id' => ['This BHC patient is already linked to another RHU source monitoring request.'],
            ]);
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function prescriptionSummaries(MonitoringHandoffRequest $handoff): array
    {
        $record = $handoff->healthRecord;
        if (! $record) {
            return [];
        }
        $auth = is_array($record->monitoring_data['prescriptionAuthorization'] ?? null)
            ? $record->monitoring_data['prescriptionAuthorization']
            : null;
        if (! $auth) {
            return [];
        }

        return array_values(array_map(function (array $row) use ($auth) {
            return [
                'medicineName' => $row['medicineName'] ?? null,
                'strength' => $row['strength'] ?? null,
                'dose' => $row['dose'] ?? null,
                'route' => $row['route'] ?? null,
                'frequency' => $row['frequency'] ?? null,
                'duration' => $row['duration'] ?? null,
                'instructions' => $row['instructions'] ?? null,
                'authorizedQuantity' => $row['authorizedQuantity'] ?? null,
                'authorizedUnit' => $row['authorizedUnit'] ?? null,
                'line' => $row['line'] ?? null,
                'physicianName' => $auth['physicianName'] ?? null,
                'authorizedAt' => $auth['authorizedAt'] ?? null,
            ];
        }, $record->structuredPrescriptionSummaries()));
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
