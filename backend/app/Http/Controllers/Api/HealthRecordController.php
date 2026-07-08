<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\HealthRecordRequest;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Services\AuditLogger;
use App\Services\FollowUpTaskSyncService;
use App\Support\StoredFunction;
use Illuminate\Http\Request;

class HealthRecordController extends Controller
{
    public function index(Request $request)
    {
        if (StoredFunction::available()) {
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

        $query = $this->scope(HealthRecord::query(), $request)->with('patient');

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
        FollowUpTaskSyncService $followUpTasks
    )
    {
        $data = $request->validated();
        $patient = Patient::findOrFail($data['patient_id']);
        $this->authorizePatient($request, $patient);
        $this->normalizeVisitTypeData($request, $data, true);
        $this->normalizeMaternalSupplements($request, $data);
        $this->normalizeFamilyPlanningData($data);

        $data['created_by'] = $request->user()->id;
        $data['barangay_health_center_id'] = $patient->barangay_health_center_id;
        $data['rural_health_unit_id'] = $patient->rural_health_unit_id;
        $data['date_recorded'] ??= now();

        $record = HealthRecord::create($data);
        $followUpTasks->syncRecord($record, $request->user());
        $followUpTasks->fulfillParentTask($record, $request->user());
        $auditLogger->log($request, 'created', 'health_records', "Created health record {$record->id}.");

        return response()->json(['data' => $record->load('patient')], 201);
    }

    public function show(Request $request, HealthRecord $healthRecord)
    {
        $this->authorizeRecord($request, $healthRecord);

        if (StoredFunction::available()) {
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

            return response()->json(['data' => $data]);
        }

        return response()->json(['data' => $healthRecord->load('patient')]);
    }

    public function update(
        HealthRecordRequest $request,
        HealthRecord $healthRecord,
        AuditLogger $auditLogger,
        FollowUpTaskSyncService $followUpTasks
    )
    {
        $this->authorizeRecord($request, $healthRecord);
        $data = $request->validated();
        $this->normalizeVisitTypeData($request, $data);
        $this->normalizeMaternalSupplements($request, $data);
        $this->normalizeFamilyPlanningData($data, $healthRecord);
        $healthRecord->update($data);
        $followUpTasks->syncRecord($healthRecord->fresh(), $request->user());
        $auditLogger->log($request, 'updated', 'health_records', "Updated health record {$healthRecord->id}.");

        return response()->json(['data' => $healthRecord->fresh()->load('patient')]);
    }

    public function destroy(Request $request, HealthRecord $healthRecord)
    {
        $this->authorizeRecord($request, $healthRecord);
        $healthRecord->delete();

        return response()->json(status: 204);
    }

    private function scope($query, Request $request)
    {
        $user = $request->user();

        if ($user->isBhw()) {
            $query->where('barangay_health_center_id', $user->barangay_health_center_id);
        } elseif ($user->isRhuStaff()) {
            $query->where('rural_health_unit_id', $user->rural_health_unit_id);
        }

        return $query;
    }

    private function authorizeRecord(Request $request, HealthRecord $record): void
    {
        $allowed = $request->user()->isAdmin()
            || ($request->user()->isBhw() && $record->barangay_health_center_id === $request->user()->barangay_health_center_id)
            || ($request->user()->isRhuStaff() && $record->rural_health_unit_id === $request->user()->rural_health_unit_id);

        abort_unless($allowed, 403, 'Health record is outside your assigned facility.');
    }

    private function authorizePatient(Request $request, Patient $patient): void
    {
        $allowed = $request->user()->isAdmin()
            || ($request->user()->isBhw() && $patient->barangay_health_center_id === $request->user()->barangay_health_center_id)
            || ($request->user()->isRhuStaff() && $patient->rural_health_unit_id === $request->user()->rural_health_unit_id);

        abort_unless($allowed, 403, 'Patient is outside your assigned facility.');
    }

    private function normalizeVisitTypeData(Request $request, array &$data, bool $defaultInitial = false): void
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
            $this->authorizeRecord($request, $parentRecord);
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

}
