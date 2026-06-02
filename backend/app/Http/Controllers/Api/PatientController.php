<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PatientRequest;
use App\Models\Patient;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class PatientController extends Controller
{
    public function index(Request $request)
    {
        $query = $this->scope(Patient::query(), $request)->with(['barangayHealthCenter', 'ruralHealthUnit']);

        if ($search = $request->query('search')) {
            $query->where(fn ($q) => $q
                ->where('first_name', 'like', "%{$search}%")
                ->orWhere('middle_name', 'like', "%{$search}%")
                ->orWhere('last_name', 'like', "%{$search}%")
                ->orWhere('philhealth_number', 'like', "%{$search}%"));
        }

        foreach (['patient_category', 'barangay', 'status'] as $filter) {
            if ($request->query($filter)) {
                $query->where($filter, $request->query($filter));
            }
        }

        return response()->json(['data' => $query->latest()->paginate($request->integer('per_page', 25))]);
    }

    public function store(PatientRequest $request, AuditLogger $auditLogger)
    {
        $data = $request->validated();
        $user = $request->user();
        $data['created_by'] = $user->id;

        if ($user->isBhw()) {
            $data['barangay_health_center_id'] = $user->barangay_health_center_id;
        }

        if ($user->isRhuStaff()) {
            $data['rural_health_unit_id'] = $user->rural_health_unit_id;
        }

        $patient = Patient::create($data);
        $auditLogger->log($request, 'created', 'patients', "Created patient {$patient->full_name}.");

        return response()->json(['data' => $patient->load(['barangayHealthCenter', 'ruralHealthUnit'])], 201);
    }

    public function show(Request $request, Patient $patient)
    {
        $this->authorizePatient($request, $patient);

        return response()->json(['data' => $patient->load(['healthRecords', 'referrals.feedback'])]);
    }

    public function update(PatientRequest $request, Patient $patient, AuditLogger $auditLogger)
    {
        $this->authorizePatient($request, $patient);
        $patient->update($request->validated());
        $auditLogger->log($request, 'updated', 'patients', "Updated patient {$patient->full_name}.");

        return response()->json(['data' => $patient->fresh()]);
    }

    public function destroy(Request $request, Patient $patient, AuditLogger $auditLogger)
    {
        $this->authorizePatient($request, $patient);
        $patient->update(['status' => 'inactive']);
        $auditLogger->log($request, 'deactivated', 'patients', "Deactivated patient {$patient->full_name}.");

        return response()->json(['data' => $patient->fresh()]);
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

    private function authorizePatient(Request $request, Patient $patient): void
    {
        $allowed = $request->user()->isAdmin()
            || ($request->user()->isBhw() && $patient->barangay_health_center_id === $request->user()->barangay_health_center_id)
            || ($request->user()->isRhuStaff() && $patient->rural_health_unit_id === $request->user()->rural_health_unit_id);

        abort_unless($allowed, 403, 'Patient is outside your assigned facility.');
    }
}
