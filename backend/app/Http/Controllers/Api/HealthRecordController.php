<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\HealthRecordRequest;
use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\Patient;
use App\Services\AuditLogger;
use App\Services\FollowUpTaskSyncService;
use App\Support\StoredFunction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
        $dispensedMedicines = $data['dispensed_medicines'] ?? [];
        unset($data['dispensed_medicines']);

        $data['created_by'] = $request->user()->id;
        $data['barangay_health_center_id'] = $patient->barangay_health_center_id;
        $data['rural_health_unit_id'] = $patient->rural_health_unit_id;
        $data['date_recorded'] ??= now();

        $record = DB::transaction(function () use ($data, $dispensedMedicines, $request, $followUpTasks, $auditLogger) {
            $record = HealthRecord::create($data);
            $this->recordDispensedMedicines($request, $record, $dispensedMedicines);
            $followUpTasks->syncRecord($record, $request->user());
            $followUpTasks->fulfillParentTask($record, $request->user());
            $auditLogger->log($request, 'created', 'health_records', "Created health record {$record->id}.");

            return $record;
        });

        return response()->json(['data' => $record->load(['patient', 'dispensedMedicines'])], 201);
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

            $data['dispensed_medicines'] = $healthRecord->dispensedMedicines()->latest()->get();
            return response()->json(['data' => $data]);
        }

        return response()->json(['data' => $healthRecord->load(['patient', 'dispensedMedicines'])]);
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
        unset($data['dispensed_medicines']);
        $healthRecord->update($data);
        $followUpTasks->syncRecord($healthRecord->fresh(), $request->user());
        $auditLogger->log($request, 'updated', 'health_records', "Updated health record {$healthRecord->id}.");

        return response()->json(['data' => $healthRecord->fresh()->load(['patient', 'dispensedMedicines'])]);
    }

    public function dispenseMedicines(Request $request, HealthRecord $healthRecord)
    {
        $this->authorizeRecord($request, $healthRecord);
        $data = $request->validate(
            [
                'dispensed_medicines' => ['nullable', 'array'],
                'dispensed_medicines.*.medicine_id' => ['required', 'integer', 'exists:medicines,id'],
                'dispensed_medicines.*.quantity' => ['required', 'integer', 'min:1'],
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

        abort_if(
            $healthRecord->dispensedMedicines()->exists(),
            422,
            'Medicines have already been dispensed for this health record.'
        );

        DB::transaction(function () use ($request, $healthRecord, $data) {
            $this->recordDispensedMedicines(
                $request,
                $healthRecord,
                $data['dispensed_medicines'] ?? []
            );
        });

        return response()->json(['data' => $healthRecord->fresh()->load(['patient', 'dispensedMedicines'])]);
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

    private function recordDispensedMedicines(Request $request, HealthRecord $record, array $dispensedMedicines): void
    {
        if (empty($dispensedMedicines)) {
            return;
        }

        abort_unless($request->user()->isBhw(), 422, 'Medicine dispensing is only available for BHC visits.');

        $merged = [];
        foreach ($dispensedMedicines as $item) {
            $medicineId = (int) ($item['medicine_id'] ?? 0);
            $quantity = (int) ($item['quantity'] ?? 0);

            abort_if($medicineId <= 0, 422, 'Please select a medicine.');
            abort_if($quantity <= 0, 422, 'Quantity must be greater than 0.');

            if (! isset($merged[$medicineId])) {
                $merged[$medicineId] = [
                    'medicine_id' => $medicineId,
                    'quantity' => 0,
                    'unit' => $item['unit'] ?? null,
                    'remarks' => $item['remarks'] ?? null,
                ];
            }

            $merged[$medicineId]['quantity'] += $quantity;
            if (! empty($item['remarks'])) {
                $merged[$medicineId]['remarks'] = trim(implode(' ', array_filter([
                    $merged[$medicineId]['remarks'],
                    $item['remarks'],
                ])));
            }
        }

        foreach (array_values($merged) as $item) {
            $medicine = Medicine::query()
                ->whereKey($item['medicine_id'])
                ->whereNull('rural_health_unit_id')
                ->where('barangay_health_center_id', $record->barangay_health_center_id)
                ->lockForUpdate()
                ->first();

            abort_unless($medicine, 422, 'Please select a medicine from BHC inventory.');
            abort_if((int) $medicine->quantity <= 0, 422, 'This medicine is out of stock.');
            abort_if((int) $item['quantity'] > (int) $medicine->quantity, 422, 'Quantity cannot exceed available stock.');

            $newQuantity = (int) $medicine->quantity - (int) $item['quantity'];
            $medicine->update([
                'quantity' => $newQuantity,
                'availability_status' => $this->medicineStatus(
                    $newQuantity,
                    (int) ($medicine->low_stock_threshold ?? 10)
                ),
                'updated_by' => $request->user()->id,
            ]);

            $record->dispensedMedicines()->create([
                'medicine_id' => $medicine->id,
                'medicine_name_snapshot' => $medicine->name,
                'category_snapshot' => $medicine->category,
                'quantity' => $item['quantity'],
                'unit' => $item['unit'] ?: $medicine->unit,
                'remarks' => $item['remarks'] ?? null,
                'dispensed_by' => $request->user()->id,
                'barangay_health_center_id' => $record->barangay_health_center_id,
            ]);
        }
    }

    private function medicineStatus(int $quantity, int $lowStockThreshold = 10): string
    {
        if ($quantity <= 0) {
            return 'Unavailable';
        }

        return $quantity <= $lowStockThreshold ? 'Low Stock' : 'Available';
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
