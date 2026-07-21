<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\HealthRecordRequest;
use App\Models\HealthRecord;
use App\Models\FollowUpTask;
use App\Models\Patient;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\FollowUpTaskSyncService;
use App\Services\HealthRecordIdempotencyService;
use App\Services\MedicineStockService;
use App\Services\ReferralCreationService;
use App\Support\StoredFunction;
use Illuminate\Http\Request;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class HealthRecordController extends Controller
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly MedicineStockService $medicineStock
    ) {
    }

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
            ->with('patient');

        if ($request->query('patient_id')) {
            $query->where('patient_id', $request->query('patient_id'));
        }

        if ($request->query('category')) {
            $query->where('category', $request->query('category'));
        }

        return response()->json(['data' => $query->latest('date_recorded')->paginate($request->integer('per_page', 25))]);
    }

    public function store(
        HealthRecordRequest $request,
        AuditLogger $auditLogger,
        FollowUpTaskSyncService $followUpTasks,
        HealthRecordIdempotencyService $idempotency,
        ReferralCreationService $referralCreation
    )
    {
        $data = $request->validated();
        $patient = Patient::findOrFail($data['patient_id']);
        $this->facilityAccess->authorizePatientModification($request->user(), $patient);
        $idempotencyKey = $data['idempotency_key'];
        $idempotencyHash = $idempotency->hash($data);
        $legacyIdempotencyHash = $idempotency->legacyHash($data);

        if ($existing = HealthRecord::query()
            ->where('created_by', $request->user()->id)
            ->where('idempotency_key', $idempotencyKey)
            ->first()) {
            return $this->replayResponse(
                $request,
                $existing,
                $idempotencyHash,
                $legacyIdempotencyHash
            );
        }

        unset($data['idempotency_key']);
        $referralData = $data['referral'] ?? null;
        unset($data['referral']);

        if (
            empty($data['parent_health_record_id'])
            && ($data['visit_type'] ?? 'initial_consultation') !== 'follow_up_visit'
            && ($matchingTask = $followUpTasks->findActiveMatchingTask(
                $patient,
                $data['category'] ?? null,
                $request->user()
            ))
        ) {
            $data['parent_health_record_id'] = $matchingTask->health_record_id;
            $data['visit_type'] = 'follow_up_visit';
            $data['monitoring_data'] = [
                ...($data['monitoring_data'] ?? []),
                'followUpTaskId' => $matchingTask->id,
                'follow_up_task_id' => $matchingTask->id,
            ];
        }
        $this->normalizeVisitTypeData($request, $data, true);
        $this->normalizeMaternalSupplements($request, $data);
        $this->normalizeFamilyPlanningData($data);
        $dispensedMedicines = $data['dispensed_medicines'] ?? [];
        unset($data['dispensed_medicines']);

        $data['created_by'] = $request->user()->id;
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
                $idempotencyKey
            ) {
                $lockedFollowUpTask = $followUpTasks->lockTaskForProcessing(
                    $data,
                    $patient,
                    $request->user()
                );
                $record = HealthRecord::create($data);
                $this->medicineStock->dispense($request, $record, $dispensedMedicines);
                $followUpTasks->syncRecord($record, $request->user(), $lockedFollowUpTask);
                $followUpTasks->fulfillParentTask($record, $request->user(), $lockedFollowUpTask);

                if (is_array($referralData)) {
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
                }

                $auditLogger->log($request, 'created', 'health_records', "Created health record {$record->id}.");

                return $record;
            });
        } catch (QueryException $exception) {
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

            return $this->replayResponse(
                $request,
                $record,
                $idempotencyHash,
                $legacyIdempotencyHash
            );
        }

        return $this->storeResponse($record, false, 201);
    }

    public function show(Request $request, HealthRecord $healthRecord)
    {
        $this->facilityAccess->authorizeHealthRecord($request->user(), $healthRecord);

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
            return response()->json(['data' => $data]);
        }

        return response()->json(['data' => $healthRecord->load([
            'patient',
            'dispensedMedicines',
            'referrals' => fn ($query) => $this->facilityAccess
                ->scopeReferrals($query, $request->user()),
        ])]);
    }

    public function update(
        HealthRecordRequest $request,
        HealthRecord $healthRecord,
        AuditLogger $auditLogger,
        FollowUpTaskSyncService $followUpTasks
    )
    {
        $this->facilityAccess->authorizeHealthRecord($request->user(), $healthRecord);
        $data = $request->validated();

        if (
            array_key_exists('patient_id', $data)
            && (int) $data['patient_id'] !== (int) $healthRecord->patient_id
        ) {
            throw ValidationException::withMessages([
                'patient_id' => 'A health record cannot be reassigned to another patient.',
            ]);
        }

        unset($data['patient_id']);
        $this->normalizeVisitTypeData($request, $data, false, $healthRecord);
        $this->normalizeMaternalSupplements($request, $data);
        $this->normalizeFamilyPlanningData($data, $healthRecord);
        unset($data['dispensed_medicines']);

        DB::transaction(function () use ($healthRecord, $data, $followUpTasks, $request, $auditLogger): void {
            $healthRecord->update($data);
            $followUpTasks->syncRecord($healthRecord->fresh(), $request->user());
            $auditLogger->log($request, 'updated', 'health_records', "Updated health record {$healthRecord->id}.");
        });

        return response()->json(['data' => $healthRecord->fresh()->load(['patient', 'dispensedMedicines'])]);
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

        return response()->json(['data' => $healthRecord->fresh()->load(['patient', 'dispensedMedicines'])]);
    }

    public function destroy(Request $request, HealthRecord $healthRecord)
    {
        $this->facilityAccess->authorizeHealthRecord($request->user(), $healthRecord);
        $healthRecord->delete();

        return response()->json(status: 204);
    }

    private function normalizeVisitTypeData(
        Request $request,
        array &$data,
        bool $defaultInitial = false,
        ?HealthRecord $record = null
    ): void
    {
        if (!$defaultInitial && !array_key_exists('visit_type', $data) && !array_key_exists('parent_health_record_id', $data)) {
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
            abort_unless(
                $this->healthRecordStatus($parentRecord) === 'follow up required'
                    || $this->hasFollowUpDate($parentRecord),
                422,
                'Follow-up visits can only be linked to records with a scheduled follow-up date.'
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

    private function normalizeFamilyPlanningData(array &$data, ?HealthRecord $record = null): void
    {
        $category = $data['category'] ?? $record?->category;
        $categoryKey = strtolower(trim((string) $category));

        if ($categoryKey !== 'family planning') {
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

    private function healthRecordStatus(HealthRecord $record): string
    {
        $monitoringData = $record->monitoring_data ?? [];
        $status = $monitoringData['followUpStatus']
            ?? $monitoringData['follow_up_status']
            ?? $monitoringData['status']
            ?? 'Routine Monitoring';

        return str_replace(['_', '-'], ' ', strtolower(trim($status)));
    }

    private function hasFollowUpDate(HealthRecord $record): bool
    {
        $monitoringData = $record->monitoring_data ?? [];
        $date = $monitoringData['followUpDate']
            ?? $monitoringData['follow_up_date']
            ?? null;

        return filled($date);
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
        $completedFollowUpTaskId = FollowUpTask::query()
            ->where('fulfilled_by_health_record_id', $record->id)
            ->value('id');
        $nextFollowUpTaskId = FollowUpTask::query()
            ->where('health_record_id', $record->id)
            ->whereNull('fulfilled_at')
            ->value('id');
        $referralId = $record->referrals()->value('id');

        return response()->json([
            'data' => $record->load(['patient', 'dispensedMedicines', 'referrals']),
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

}
