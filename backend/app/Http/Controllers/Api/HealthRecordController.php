<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\DraftFinalizationConflictException;
use App\Exceptions\ReferralSubmissionBlockedException;
use App\Http\Controllers\Controller;
use App\Http\Requests\HealthRecordRequest;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\HealthRecordDraft;
use App\Models\Patient;
use App\Services\AkayCacheService;
use App\Services\AuditLogger;
use App\Services\ClinicalRegistry;
use App\Services\ConditionMonitoringService;
use App\Services\CurrentConditionsSync;
use App\Services\FacilityAccessService;
use App\Services\FollowUpEpisodeService;
use App\Services\FollowUpTaskSyncService;
use App\Services\HealthRecordDraftService;
use App\Services\HealthRecordIdempotencyService;
use App\Services\MedicineStockService;
use App\Services\ReferralCreationService;
use App\Services\ReferralHoldService;
use App\Services\ReferralRoutingService;
use App\Support\StoredFunction;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HealthRecordController extends Controller
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly MedicineStockService $medicineStock,
        private readonly AkayCacheService $cache
    ) {}

    public function index(Request $request)
    {
        if (StoredFunction::available() && $request->user()->isAdmin()) {
            $perPage = $request->integer('per_page', 25);
            $page = max(1, $request->integer('page', 1));
            $rows = StoredFunction::select(
                'SELECT * FROM akay_health_record_list(?, ?, ?, ?, ?, ?, ?)',
                [
                    $request->user()->role,
                    $request->user()->barangay_health_center_id,
                    $request->user()->rural_health_unit_id,
                    $request->query('patient_id') ? (int) $request->query('patient_id') : null,
                    $request->query('category'),
                    $perPage,
                    ($page - 1) * $perPage,
                ]
            );

            return response()->json(['data' => StoredFunction::paginatedResponse($rows, $request)]);
        }

        $query = $this->facilityAccess
            ->scopeHealthRecords(HealthRecord::query(), $request->user())
            ->with(['patient', 'creator:id,name', ...HealthRecord::OUTCOME_RELATIONS]);

        if ($request->query('patient_id')) {
            $query->where('patient_id', $request->query('patient_id'));
        }

        if ($category = $request->query('category')) {
            // New TB records are service/General Consultation with TB-DOTS data.
            $category === 'TB DOTS / TB Monitoring'
                ? $query->where(fn ($q) => $q->where('category', $category)->orWhereNotNull('tb_data'))
                : $query->where('category', $category);
        }

        return response()->json(['data' => $query->latest('date_recorded')->paginate($request->integer('per_page', 25))]);
    }

    public function store(
        HealthRecordRequest $request,
        AuditLogger $auditLogger,
        FollowUpTaskSyncService $followUpTasks,
        HealthRecordIdempotencyService $idempotency,
        ReferralCreationService $referralCreation,
        HealthRecordDraftService $drafts,
        CurrentConditionsSync $currentConditions,
        ClinicalRegistry $clinicalRegistry,
        ConditionMonitoringService $monitoring
    ) {
        $data = $request->validated();
        $patient = Patient::findOrFail($data['patient_id']);
        $this->facilityAccess->authorizePatientModification($request->user(), $patient);
        // conditionKey is always server-resolved from the diagnosis name here -
        // any client-sent conditionKey is discarded and replaced, never trusted.
        $data['diagnoses'] = $clinicalRegistry->resolveConditionEntries($data['diagnoses'] ?? []);
        $currentConditions->assertAllowed($request->user(), $data['diagnoses']);
        $draftPublicId = $data['draft_public_id'] ?? null;
        unset($data['draft_public_id']);
        $idempotencyKey = $data['idempotency_key'];
        $idempotencyHash = $idempotency->hash($data);
        $legacyIdempotencyHash = $idempotency->legacyHash($data);
        $carePlan = $data['care_plan'] ?? [];
        unset($data['care_plan']);

        if ($existing = HealthRecord::query()
            ->where('created_by', $request->user()->id)
            ->where('idempotency_key', $idempotencyKey)
            ->first()) {
            $response = $this->replayResponse(
                $request,
                $existing,
                $idempotencyHash,
                $legacyIdempotencyHash
            );

            return $response;
        }

        // Same consultation, different submission key: the encoder reloaded
        // after a save that DID commit (its response was lost) and saved the
        // recovered draft again. idempotency_key cannot catch this - it is new -
        // but the consultation identity can. This is a 409, never a replay: the
        // idempotency contract is per key, so a "success" here would vouch for
        // content under a key that never submitted it.
        // One canonical form, matching HealthRecordDraftService, so the draft
        // and the record it becomes compare equal.
        $consultationUuid = isset($data['consultation_uuid'])
            ? strtolower(trim((string) $data['consultation_uuid'])) ?: null
            : null;
        $data['consultation_uuid'] = $consultationUuid;
        if ($consultationUuid !== null && ($recorded = HealthRecord::query()
            ->where('created_by', $request->user()->id)
            ->where('consultation_uuid', $consultationUuid)
            ->first())) {
            return $this->consultationAlreadyRecordedResponse($recorded);
        }

        unset($data['idempotency_key']);
        $referralData = $data['referral'] ?? null;
        unset($data['referral']);

        if ($this->isReferralDisposition($data, $referralData)) {
            $this->normalizeReferralDisposition($data);
        }

        $this->normalizeVisitTypeData($request, $data, true);
        $this->normalizeMaternalSupplements($request, $data);
        $this->normalizeFamilyPlanningData($data);
        $this->normalizeSurveillanceData($data);
        $this->normalizeDiagnosisReporting($data);
        $dispensedMedicines = $data['dispensed_medicines'] ?? [];
        unset($data['dispensed_medicines']);

        $data['created_by'] = $request->user()->id;
        $data['assessed_by'] = $request->user()->id;
        $data['finalized_by'] = $request->user()->id;
        $data['finalized_at'] = now();
        $data['items_planned'] = $dispensedMedicines;
        $data['idempotency_key'] = $idempotencyKey;
        $data['idempotency_hash'] = $idempotencyHash;
        $data['barangay_health_center_id'] = $patient->barangay_health_center_id;
        $data['rural_health_unit_id'] = $patient->rural_health_unit_id;
        $data['date_recorded'] ??= now();

        try {
            $record = DB::transaction(function () use (
                $data,
                $dispensedMedicines,
                $referralData,
                $patient,
                $request,
                $followUpTasks,
                $referralCreation,
                $auditLogger,
                $idempotencyKey,
                $drafts,
                $draftPublicId,
                $currentConditions,
                $monitoring,
                $carePlan
            ) {
                $lockedDraft = $draftPublicId
                    ? $drafts->lockForOfficialSave(
                        $request->user(),
                        $draftPublicId,
                        (int) $patient->id,
                        $data['category'] ?? null
                    )
                    : null;
                $lockedFollowUpTask = $followUpTasks->lockTaskForProcessing(
                    $data,
                    $patient,
                    $request->user()
                );
                $additionalTasks = $followUpTasks->lockAdditionalTasks(
                    $carePlan['continued_follow_up_task_ids'] ?? [],
                    $patient,
                    $request->user(),
                    $lockedFollowUpTask
                );
                $continuedMonitorings = $monitoring->lockContinued($patient, $carePlan['continued_monitoring_ids'] ?? []);
                $record = HealthRecord::create([...$data, 'encoded_by' => $lockedDraft?->owner_user_id ?? $request->user()->id]);
                // Registered diagnoses (conditionKey set) always sync; free-text
                // diagnoses sync only when the user ticked "Add to Current Conditions".
                $currentConditions->sync($patient, $data['diagnoses'] ?? [], $record->date_recorded->toDateString());
                $monitoredNow = $monitoring->apply(
                    $patient,
                    $record,
                    $data['diagnoses'] ?? [],
                    $continuedMonitorings,
                    $carePlan['monitoring_stops'] ?? [],
                    $request->user()
                );
                $confirmedItems = array_values(array_filter($dispensedMedicines, fn ($item) => ($item['confirmed_given'] ?? false) === true));
                foreach ($data['immunization_data']['vaccineEntries'] ?? [] as $entry) {
                    if (($entry['confirmedGiven'] ?? false) === true) {
                        $confirmedItems[] = ['medicine_id' => $entry['medicineId'], 'quantity' => $entry['inventoryQuantity'], 'remarks' => 'Administered: '.($entry['vaccineName'] ?? 'vaccine')];
                    }
                }
                if ($confirmedItems !== []) {
                    $this->medicineStock->dispense($request, $record, $confirmedItems);
                }
                $followUpTasks->syncRecord($record, $request->user(), $lockedFollowUpTask);
                $followUpTasks->fulfillParentTask($record, $request->user(), $lockedFollowUpTask);
                $followUpTasks->fulfillTasks($additionalTasks, $record, $request->user());
                $monitoring->linkFollowUpTask($record, $monitoredNow);

                if (is_array($referralData)) {
                    try {
                        $referral = $referralCreation->create($request, $patient, [
                            ...$referralData,
                            'client_submission_id' => "health-record:{$idempotencyKey}",
                        ], $record);
                        $record->update([
                            'monitoring_data' => [
                                ...($record->monitoring_data ?? []),
                                'linkedTrackingId' => $referral->tracking_id,
                                'referralTrackingId' => $referral->tracking_id,
                            ],
                        ]);
                    } catch (ReferralSubmissionBlockedException $exception) {
                        if ($exception->blockCode !== 'NO_PROVIDER_AVAILABLE') {
                            throw $exception;
                        }
                        $route = app(ReferralRoutingService::class)->resolveForBhw($request->user(), $referralData['rural_health_unit_id'] ?? null);
                        $hold = app(ReferralHoldService::class)->recordBlockedAttempt($request->user(), $patient, $route['bhc']->id, $route['rhu'], [...$referralData, 'health_record_id' => $record->id]);
                        $record->update(['monitoring_data' => [...($record->monitoring_data ?? []), 'pendingReferral' => $referralData, 'referralHoldId' => $hold->id, 'referralStatus' => 'Awaiting Doctor Availability', 'submissionStatus' => 'Not Yet Submitted']]);
                    }
                }

                $auditLogger->log($request, 'created', 'health_records', "Created health record {$record->id}.");
                if ($lockedDraft !== null) {
                    $drafts->consumeLocked(
                        $request->user(),
                        $lockedDraft,
                        (int) $record->id
                    );
                    $this->auditDraftConsumed(
                        $request,
                        $auditLogger,
                        $lockedDraft
                    );
                }

                return $record;
            });
        } catch (DraftFinalizationConflictException $exception) {
            $record = HealthRecord::query()
                ->where('created_by', $request->user()->id)
                ->where('idempotency_key', $idempotencyKey)
                ->first();

            if ($record !== null) {
                return $this->replayResponse(
                    $request,
                    $record,
                    $idempotencyHash,
                    $legacyIdempotencyHash
                );
            }

            throw $exception;
        } catch (QueryException $exception) {
            if ($this->isConsultationUuidConflict($exception)) {
                // Lost the race to a concurrent save of this consultation, or
                // the uuid belongs to another user. Only the caller's OWN record
                // is ever identified; someone else's stays invisible.
                $recorded = HealthRecord::query()
                    ->where('created_by', $request->user()->id)
                    ->where('consultation_uuid', $consultationUuid)
                    ->first();

                return $this->consultationAlreadyRecordedResponse($recorded);
            }

            if ($this->isMonitoringConflict($exception)) {
                return response()->json([
                    'message' => 'This condition was just put under monitoring by another save. Please save again.',
                    'code' => 'CONDITION_MONITORING_CONFLICT',
                ], 409);
            }

            if (! $this->isIdempotencyConflict($exception)) {
                throw $exception;
            }

            $record = HealthRecord::where('idempotency_key', $idempotencyKey)->first();
            if (! $record || (int) $record->created_by !== (int) $request->user()->id) {
                return $this->idempotencyConflictResponse(
                    'This submission key is not available for this health-record save.',
                    'IDEMPOTENCY_KEY_UNAVAILABLE'
                );
            }

            $response = $this->replayResponse(
                $request,
                $record,
                $idempotencyHash,
                $legacyIdempotencyHash
            );

            return $response;
        }

        if ($record->dispensedMedicines()->exists()) {
            $this->cache->invalidateBhcMedicineDisplay((int) $patient->barangay_health_center_id);
        }
        if (is_array($referralData)) {
            $referral = $record->referrals()->first();
            if ($referral !== null) {
                $this->cache->invalidateReferralReports($referral);
            }
        }

        return $this->storeResponse($record, false, 201);
    }

    public function show(
        Request $request,
        HealthRecord $healthRecord,
        FollowUpEpisodeService $episodes
    ) {
        $this->facilityAccess->authorizeHealthRecord($request->user(), $healthRecord);
        $episode = $episodes->forRecord($healthRecord, $request->user());

        if (StoredFunction::available() && $request->user()->isAdmin()) {
            $data = StoredFunction::selectJson(
                'SELECT akay_health_record_details(?, ?, ?, ?) AS data',
                [
                    $healthRecord->id,
                    $request->user()->role,
                    $request->user()->barangay_health_center_id,
                    $request->user()->rural_health_unit_id,
                ]
            );

            abort_unless($data, 404);

            $data['dispensed_medicines'] = $healthRecord->dispensedMedicines()->latest()->get();
            $data['follow_up_episode'] = $episode;

            return response()->json(['data' => $data]);
        }

        $data = $healthRecord->load([
            'patient',
            'creator:id,name',
            'dispensedMedicines',
            ...HealthRecord::OUTCOME_RELATIONS,
            'referrals' => fn ($query) => $this->facilityAccess
                ->scopeReferrals($query, $request->user()),
        ])->toArray();
        $data['follow_up_episode'] = $episode;

        return response()->json(['data' => $data]);
    }

    /**
     * Stream the DS-TB Treatment Card (DOH Form 4b) as a PDF.
     */
    public function tbCardPdf(Request $request, HealthRecord $healthRecord)
    {
        $this->facilityAccess->authorizeHealthRecord($request->user(), $healthRecord);

        $healthRecord->load('patient');

        abort_unless(is_array($healthRecord->tb_data), 404, 'This record has no TB treatment card.');

        $pdf = Pdf::loadView('pdf.tb-treatment-card', [
            'record' => $healthRecord,
            'patient' => $healthRecord->patient,
            'tb' => $healthRecord->tb_data,
        ])->setPaper('legal', 'landscape');

        $caseNumber = $healthRecord->tb_data['diagnosis']['tbCaseNumber'] ?? $healthRecord->id;
        $filename = 'DS-TB-Treatment-Card-'.preg_replace('/[^A-Za-z0-9_-]/', '', (string) $caseNumber).'.pdf';

        return $pdf->stream($filename);
    }

    public function update(
        HealthRecordRequest $request,
        HealthRecord $healthRecord,
        AuditLogger $auditLogger,
        FollowUpTaskSyncService $followUpTasks
    ) {
        $this->facilityAccess->authorizeHealthRecord($request->user(), $healthRecord);
        abort(409, 'Finalized records are read-only. Add a documented correction instead.');
    }

    public function dispenseMedicines(Request $request, HealthRecord $healthRecord)
    {
        $this->facilityAccess->authorizeHealthRecord($request->user(), $healthRecord);
        $data = $request->validate(
            [
                'dispensed_medicines' => ['nullable', 'array'],
                'dispensed_medicines.*.medicine_id' => ['required', 'integer', 'exists:medicines,id'],
                'dispensed_medicines.*.quantity' => ['required', 'integer', 'min:1', 'max:2147483647'],
                'dispensed_medicines.*.unit' => ['nullable', 'string', 'max:50'],
                'dispensed_medicines.*.remarks' => ['nullable', 'string'],
            ],
            [
                'dispensed_medicines.*.medicine_id.required' => 'Please select a medicine.',
                'dispensed_medicines.*.medicine_id.exists' => 'Medicine stock changed. Please refresh and try again.',
                'dispensed_medicines.*.quantity.required' => 'Quantity must be greater than 0.',
                'dispensed_medicines.*.quantity.integer' => 'Quantity must be a whole number.',
                'dispensed_medicines.*.quantity.min' => 'Quantity must be greater than 0.',
            ]
        );

        DB::transaction(function () use ($request, $healthRecord, $data): void {
            $lockedRecord = HealthRecord::query()
                ->whereKey($healthRecord->id)
                ->lockForUpdate()
                ->firstOrFail();
            $this->facilityAccess->authorizeHealthRecord($request->user(), $lockedRecord);
            abort_if(
                $lockedRecord->dispensedMedicines()->exists(),
                422,
                'Medicines have already been dispensed for this health record.'
            );

            $this->medicineStock->dispense(
                $request,
                $lockedRecord,
                $data['dispensed_medicines'] ?? []
            );
        });
        if (($data['dispensed_medicines'] ?? []) !== []) {
            $this->cache->invalidateBhcMedicineDisplay(
                (int) $healthRecord->barangay_health_center_id
            );
        }

        return response()->json(['data' => $healthRecord->fresh()->load([
            'patient',
            'dispensedMedicines',
            ...HealthRecord::OUTCOME_RELATIONS,
        ])]);
    }

    public function destroy(Request $request, HealthRecord $healthRecord)
    {
        $this->facilityAccess->authorizeHealthRecord($request->user(), $healthRecord);
        abort(409, 'Finalized records cannot be deleted. Add a documented correction instead.');
    }

    private function normalizeVisitTypeData(
        Request $request,
        array &$data,
        bool $defaultInitial = false,
        ?HealthRecord $record = null
    ): void {
        if (! $defaultInitial && ! array_key_exists('visit_type', $data) && ! array_key_exists('parent_health_record_id', $data)) {
            return;
        }

        $data['visit_type'] ??= empty($data['parent_health_record_id'])
            ? 'initial_consultation'
            : 'follow_up_visit';

        if ($data['visit_type'] === 'follow_up_visit') {
            abort_if(empty($data['parent_health_record_id']), 422, 'Follow-up visits must be linked to an original health record.');

            $parentRecord = HealthRecord::findOrFail($data['parent_health_record_id']);
            $this->facilityAccess->authorizeHealthRecord($request->user(), $parentRecord);
            abort_unless(
                (int) $parentRecord->patient_id === (int) ($data['patient_id'] ?? $record?->patient_id),
                422,
                'Follow-up visits must be linked to a record for the same patient.'
            );
        }

        if ($data['visit_type'] === 'initial_consultation') {
            $data['parent_health_record_id'] = null;
        }
    }

    private function normalizeMaternalSupplements(Request $request, array &$data): void
    {
        if (! array_key_exists('maternal_data', $data) || ! is_array($data['maternal_data'])) {
            return;
        }

        $supplements = $data['maternal_data']['supplements_given'] ?? null;
        if (! is_array($supplements)) {
            return;
        }

        $user = $request->user();
        $data['maternal_data']['supplements_given'] = array_values(array_map(
            fn (array $supplement): array => [
                ...$supplement,
                'supplement_type' => $supplement['supplement_type'] ?? '',
                'supplement_name' => $supplement['supplement_name'] ?? '',
                'quantity' => $supplement['quantity'] ?? null,
                'unit' => $supplement['unit'] ?? '',
                'date_given' => $supplement['date_given'] ?? null,
                'remarks' => $supplement['remarks'] ?? '',
                'given_by_id' => $supplement['given_by_id'] ?? $user?->id,
                'given_by_name' => $supplement['given_by_name'] ?? $user?->name,
            ],
            $supplements
        ));
    }

    /**
     * Legacy clients only: derives the HFMD mirror fields from surveillanceTags.
     * (hfmdSurveillance, surveillanceCategory, diseaseSurveillanceCategory and
     * their snake_case aliases.) Current clients flag diagnoses[].includeInSurveillance
     * and never send surveillanceTags, so this does nothing for them; a save
     * with no surveillanceTags key leaves the legacy keys exactly as sent.
     */
    private function normalizeSurveillanceData(array &$data): void
    {
        if (! array_key_exists('monitoring_data', $data) || ! is_array($data['monitoring_data'])) {
            return;
        }
        if (! array_key_exists('surveillanceTags', $data['monitoring_data'])) {
            return;
        }

        $tags = $data['monitoring_data']['surveillanceTags'];
        $tags = is_array($tags) ? array_values(array_unique(array_filter($tags, 'is_string'))) : [];
        $data['monitoring_data']['surveillanceTags'] = $tags;

        $hfmd = in_array('hfmd', $tags, true);
        $category = $hfmd ? 'hfmd' : null;
        $data['monitoring_data']['hfmdSurveillance'] = $hfmd;
        $data['monitoring_data']['hfmd_surveillance'] = $hfmd;
        $data['monitoring_data']['surveillanceCategory'] = $category;
        $data['monitoring_data']['surveillance_category'] = $category;
        $data['monitoring_data']['diseaseSurveillanceCategory'] = $category;
        $data['monitoring_data']['disease_surveillance_category'] = $category;
    }

    /**
     * When the diagnoses carry reportAs (the per-diagnosis Morbidity /
     * Notifiable choice), they are authoritative: the visit-level mirrors
     * (morbidityReportingStatus, includeInMorbidityReport, isNotifiableDisease
     * and their snake_case aliases) are derived from them here - notifiable if
     * any diagnosis is notifiable, else morbidity if any is morbidity, else
     * not_included - so every existing reader keeps working. A save whose
     * diagnoses carry no reportAs key at all (the follow-up form's free-text
     * assessment, or an older client) leaves the visit-level keys exactly as
     * the client sent them, mirroring normalizeSurveillanceData.
     */
    private function normalizeDiagnosisReporting(array &$data): void
    {
        $diagnoses = array_values(array_filter($data['diagnoses'] ?? [], 'is_array'));
        $reported = array_filter($diagnoses, fn (array $diagnosis) => array_key_exists('reportAs', $diagnosis));
        if ($reported === []) {
            return;
        }

        $types = array_column($reported, 'reportAs');
        $status = in_array('notifiable', $types, true)
            ? 'notifiable'
            : (in_array('morbidity', $types, true) ? 'morbidity' : 'not_included');

        $monitoringData = is_array($data['monitoring_data'] ?? null) ? $data['monitoring_data'] : [];
        $monitoringData['morbidityReportingStatus'] = $status;
        $monitoringData['morbidity_reporting_status'] = $status;
        $monitoringData['includeInMorbidityReport'] = $status !== 'not_included';
        $monitoringData['include_in_morbidity_report'] = $status !== 'not_included';
        $monitoringData['isNotifiableDisease'] = $status === 'notifiable';
        $monitoringData['is_notifiable_disease'] = $status === 'notifiable';
        $data['monitoring_data'] = $monitoringData;
    }

    private function normalizeFamilyPlanningData(array &$data, ?HealthRecord $record = null): void
    {
        $category = $data['category'] ?? $record?->category;
        $categoryKey = strtolower(trim((string) $category));

        $programs = $data['monitoring_data']['selectedPrograms'] ?? $record?->monitoring_data['selectedPrograms'] ?? [];
        if ($categoryKey !== 'family planning' && ! in_array('Family Planning', $programs, true)) {
            if (array_key_exists('category', $data) || $record === null) {
                $data['family_planning_data'] = null;
            }

            return;
        }

        if (! array_key_exists('family_planning_data', $data)) {
            return;
        }

        if (! is_array($data['family_planning_data'])) {
            $data['family_planning_data'] = [];

            return;
        }

        $familyPlanning = $data['family_planning_data'];
        $data['family_planning_data'] = [
            'clientType' => $familyPlanning['clientType'] ?? $familyPlanning['client_type'] ?? null,
            'client_type' => $familyPlanning['client_type'] ?? $familyPlanning['clientType'] ?? null,
            'methodUsed' => $familyPlanning['methodUsed'] ?? $familyPlanning['method_used'] ?? null,
            'method_used' => $familyPlanning['method_used'] ?? $familyPlanning['methodUsed'] ?? null,
            'previousMethod' => $familyPlanning['previousMethod'] ?? $familyPlanning['previous_method'] ?? null,
            'previous_method' => $familyPlanning['previous_method'] ?? $familyPlanning['previousMethod'] ?? null,
            'fpVisitType' => $familyPlanning['fpVisitType'] ?? $familyPlanning['fp_visit_type'] ?? $familyPlanning['visitType'] ?? $familyPlanning['visit_type'] ?? null,
            'fp_visit_type' => $familyPlanning['fp_visit_type'] ?? $familyPlanning['fpVisitType'] ?? $familyPlanning['visitType'] ?? $familyPlanning['visit_type'] ?? null,
            'visitType' => $familyPlanning['visitType'] ?? $familyPlanning['visit_type'] ?? $familyPlanning['fpVisitType'] ?? $familyPlanning['fp_visit_type'] ?? null,
            'visit_type' => $familyPlanning['visit_type'] ?? $familyPlanning['visitType'] ?? $familyPlanning['fpVisitType'] ?? $familyPlanning['fp_visit_type'] ?? null,
            'source' => $familyPlanning['source'] ?? null,
            'dateRegistered' => $familyPlanning['dateRegistered'] ?? $familyPlanning['date_registered'] ?? null,
            'date_registered' => $familyPlanning['date_registered'] ?? $familyPlanning['dateRegistered'] ?? null,
            'dateOfVisit' => $familyPlanning['dateOfVisit'] ?? $familyPlanning['date_of_visit'] ?? null,
            'date_of_visit' => $familyPlanning['date_of_visit'] ?? $familyPlanning['dateOfVisit'] ?? null,
            'nextAppointmentDate' => $familyPlanning['nextAppointmentDate'] ?? $familyPlanning['next_appointment_date'] ?? null,
            'next_appointment_date' => $familyPlanning['next_appointment_date'] ?? $familyPlanning['nextAppointmentDate'] ?? null,
            'remarks' => $familyPlanning['remarks'] ?? $familyPlanning['notes'] ?? null,
            'actionTaken' => $familyPlanning['actionTaken'] ?? $familyPlanning['action_taken'] ?? null,
            'action_taken' => $familyPlanning['action_taken'] ?? $familyPlanning['actionTaken'] ?? null,
            'hasClinicalConcern' => $familyPlanning['hasClinicalConcern'] ?? $familyPlanning['has_clinical_concern'] ?? false,
            'has_clinical_concern' => $familyPlanning['has_clinical_concern'] ?? $familyPlanning['hasClinicalConcern'] ?? false,
            'concern' => $familyPlanning['concern'] ?? null,
            'findings' => $familyPlanning['findings'] ?? null,
            'adviceGiven' => $familyPlanning['adviceGiven'] ?? $familyPlanning['advice_given'] ?? null,
            'advice_given' => $familyPlanning['advice_given'] ?? $familyPlanning['adviceGiven'] ?? null,
        ];
    }

    private function isReferralDisposition(
        array $data,
        mixed $referralData
    ): bool {
        return ($data['needs_referral'] ?? false) === true
            || is_array($referralData);
    }

    private function normalizeReferralDisposition(array &$data): void
    {
        $monitoringData = $data['monitoring_data'] ?? [];
        // "Monitor at BHC + Refer to RHU": the condition stays under BHC
        // monitoring, so its next follow-up survives the referral.
        $keepsFollowUp = \App\Services\CarePlan::monitorsAny($data['diagnoses'] ?? []);
        $data['monitoring_data'] = [
            ...$monitoringData,
            'followUpStatus' => 'Needs Referral',
            'follow_up_status' => 'Needs Referral',
            ...($keepsFollowUp ? [] : [
                'followUpDate' => null,
                'follow_up_date' => null,
                'followUpTime' => null,
                'follow_up_time' => null,
            ]),
        ];
    }

    private function replayResponse(
        Request $request,
        HealthRecord $record,
        string $idempotencyHash,
        string $legacyIdempotencyHash
    ) {
        $this->facilityAccess->authorizeHealthRecord($request->user(), $record);

        $storedHash = (string) $record->idempotency_hash;
        if (
            ! hash_equals($storedHash, $idempotencyHash)
            && ! hash_equals($storedHash, $legacyIdempotencyHash)
        ) {
            return $this->idempotencyConflictResponse(
                'This submission key was already used for different health-record data.',
                'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH'
            );
        }

        return $this->storeResponse($record, true, 200);
    }

    private function storeResponse(HealthRecord $record, bool $replay, int $status)
    {
        // One ITR can fulfil several continued follow-ups; the one reported is
        // the parent record's task (the visit's primary follow-up), else the
        // lowest id - never whatever row the database happens to return first.
        $completedFollowUpTaskId = FollowUpTask::query()
            ->where('fulfilled_by_health_record_id', $record->id)
            ->orderByRaw(
                'CASE WHEN health_record_id = ? THEN 0 ELSE 1 END',
                [(int) $record->parent_health_record_id]
            )
            ->orderBy('id')
            ->value('id');
        $nextFollowUpTaskId = FollowUpTask::query()
            ->where('health_record_id', $record->id)
            ->whereNull('fulfilled_at')
            ->value('id');
        $referralId = $record->referrals()->value('id');

        return response()->json([
            'data' => $record->load([
                'patient',
                'creator:id,name',
                'dispensedMedicines',
                'referrals',
                ...HealthRecord::OUTCOME_RELATIONS,
            ]),
            'idempotent_replay' => $replay,
            'result' => [
                'health_record_id' => $record->id,
                'referral_id' => $referralId,
                'completed_follow_up_task_id' => $completedFollowUpTaskId,
                'next_follow_up_task_id' => $nextFollowUpTaskId,
            ],
        ], $status);
    }

    private function idempotencyConflictResponse(string $message, string $code)
    {
        return response()->json([
            'message' => $message,
            'code' => $code,
        ], 409);
    }

    private function isIdempotencyConflict(QueryException $exception): bool
    {
        $sqlState = $exception->errorInfo[0] ?? null;
        $message = strtolower($exception->getMessage());

        return in_array($sqlState, ['23505', '23000'], true)
            && str_contains($message, 'idempotency_key');
    }

    /**
     * The partial unique index "one active monitoring per patient and
     * condition" (condition_monitorings_one_active_idx). PostgreSQL names the
     * index; SQLite names its columns instead ("UNIQUE constraint failed:
     * condition_monitorings.patient_id, condition_monitorings.condition_identity").
     */
    private function isMonitoringConflict(QueryException $exception): bool
    {
        $message = strtolower($exception->getMessage());

        return in_array($exception->errorInfo[0] ?? null, ['23505', '23000'], true)
            && (str_contains($message, 'condition_monitorings_one_active_idx')
                || str_contains($message, 'condition_monitorings.condition_identity'));
    }

    private function isConsultationUuidConflict(QueryException $exception): bool
    {
        $sqlState = $exception->errorInfo[0] ?? null;
        $message = strtolower($exception->getMessage());

        return in_array($sqlState, ['23505', '23000'], true)
            && str_contains($message, 'consultation_uuid');
    }

    /**
     * One consultation, one official record. The caller's own record id is
     * returned so the client can take the encoder to it; a record owned by
     * anyone else is never identified.
     */
    private function consultationAlreadyRecordedResponse(?HealthRecord $record)
    {
        return response()->json([
            'message' => 'This consultation has already been saved as a health record.',
            'code' => 'CONSULTATION_ALREADY_RECORDED',
            'health_record_id' => $record?->id,
        ], 409);
    }

    private function auditDraftConsumed(
        Request $request,
        AuditLogger $auditLogger,
        HealthRecordDraft $draft
    ): void {
        $auditLogger->log(
            $request,
            'draft_consumed',
            'health_record_drafts',
            implode('; ', [
                "draft_public_id={$draft->public_id}",
                "owner_user_id={$draft->owner_user_id}",
                "bhc_id={$draft->barangay_health_center_id}",
                "classification={$draft->classification}",
                "version={$draft->version}",
            ]).'.'
        );
    }
}
