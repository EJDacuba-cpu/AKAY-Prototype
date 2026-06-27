<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\HealthRecordRequest;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Services\AuditLogger;
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

    public function store(HealthRecordRequest $request, AuditLogger $auditLogger)
    {
        $data = $request->validated();
        $patient = Patient::findOrFail($data['patient_id']);
        $this->authorizePatient($request, $patient);
        $this->normalizeVisitTypeData($request, $data, true);

        $data['created_by'] = $request->user()->id;
        $data['barangay_health_center_id'] = $patient->barangay_health_center_id;
        $data['rural_health_unit_id'] = $patient->rural_health_unit_id;
        $data['date_recorded'] ??= now();

        $record = HealthRecord::create($data);
        $this->syncFollowUpTask($request, $record);
        $this->fulfillParentFollowUpTask($request, $record);
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

    public function update(HealthRecordRequest $request, HealthRecord $healthRecord, AuditLogger $auditLogger)
    {
        $this->authorizeRecord($request, $healthRecord);
        $data = $request->validated();
        $this->normalizeVisitTypeData($request, $data);
        $healthRecord->update($data);
        $this->syncFollowUpTask($request, $healthRecord->fresh());
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
                $this->healthRecordStatus($parentRecord) === 'follow up required',
                422,
                'Follow-up visits can only be linked to records marked Follow-up Required.'
            );
        }

        if ($data['visit_type'] === 'initial_consultation') {
            $data['parent_health_record_id'] = null;
        }
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

    private function followUpDate(HealthRecord $record): ?string
    {
        $monitoringData = $record->monitoring_data ?? [];
        $date = $monitoringData['followUpDate']
            ?? $monitoringData['follow_up_date']
            ?? null;

        return $date ?: null;
    }

    private function syncFollowUpTask(Request $request, HealthRecord $record): void
    {
        if ($record->visit_type === 'follow_up_visit') {
            return;
        }

        $status = $this->healthRecordStatus($record);
        $dueDate = $this->followUpDate($record);

        if ($status !== 'follow up required' || ! $dueDate) {
            FollowUpTask::where('health_record_id', $record->id)
                ->whereIn('state', [FollowUpTask::STATE_PENDING, FollowUpTask::STATE_RESCHEDULED])
                ->delete();
            return;
        }

        FollowUpTask::updateOrCreate(
            ['health_record_id' => $record->id],
            [
                'patient_id' => $record->patient_id,
                'barangay_health_center_id' => $record->barangay_health_center_id,
                'due_date' => $dueDate,
                'state' => FollowUpTask::STATE_PENDING,
                'no_show_at' => null,
                'fulfilled_at' => null,
                'fulfilled_by_health_record_id' => null,
                'created_by' => $record->created_by,
                'updated_by' => $request->user()->id,
            ]
        );
    }

    private function fulfillParentFollowUpTask(Request $request, HealthRecord $record): void
    {
        if ($record->visit_type !== 'follow_up_visit' || ! $record->parent_health_record_id) {
            return;
        }

        FollowUpTask::where('health_record_id', $record->parent_health_record_id)
            ->whereNull('fulfilled_at')
            ->update([
                'state' => FollowUpTask::STATE_FULFILLED,
                'fulfilled_at' => now(),
                'fulfilled_by_health_record_id' => $record->id,
                'updated_by' => $request->user()->id,
            ]);
    }
}
