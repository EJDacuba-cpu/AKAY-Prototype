<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\HealthRecordRequest;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class HealthRecordController extends Controller
{
    public function index(Request $request)
    {
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

        $data['created_by'] = $request->user()->id;
        $data['barangay_health_center_id'] = $patient->barangay_health_center_id;
        $data['rural_health_unit_id'] = $patient->rural_health_unit_id;
        $data['date_recorded'] ??= now();

        $record = HealthRecord::create($data);
        $auditLogger->log($request, 'created', 'health_records', "Created health record {$record->id}.");

        return response()->json(['data' => $record->load('patient')], 201);
    }

    public function show(Request $request, HealthRecord $healthRecord)
    {
        $this->authorizeRecord($request, $healthRecord);

        return response()->json(['data' => $healthRecord->load('patient')]);
    }

    public function update(HealthRecordRequest $request, HealthRecord $healthRecord, AuditLogger $auditLogger)
    {
        $this->authorizeRecord($request, $healthRecord);
        $healthRecord->update($request->validated());
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
}
