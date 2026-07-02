<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PatientRequest;
use App\Models\Patient;
use App\Services\AuditLogger;
use App\Support\StoredFunction;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class PatientController extends Controller
{
    public function index(Request $request)
    {
        if (StoredFunction::available()) {
            $perPage = $request->integer('per_page', 25);
            $page = max(1, $request->integer('page', 1));
            $rows = StoredFunction::select(
                'SELECT * FROM akay_patient_list(?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $request->user()->role,
                    $request->user()->barangay_health_center_id,
                    $request->user()->rural_health_unit_id,
                    $request->query('search'),
                    $request->query('patient_category'),
                    $request->query('barangay'),
                    $request->query('status'),
                    $perPage,
                    ($page - 1) * $perPage,
                ]
            );

            return response()->json(['data' => StoredFunction::paginatedResponse($rows, $request)]);
        }

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
        $data = $this->normalizeProfileFields($request->validated());
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

        if (StoredFunction::available()) {
            $data = StoredFunction::selectJson(
                'SELECT akay_patient_details(?, ?, ?, ?) AS data',
                [
                    $patient->id,
                    $request->user()->role,
                    $request->user()->barangay_health_center_id,
                    $request->user()->rural_health_unit_id,
                ]
            );

            abort_unless($data, 404);

            return response()->json(['data' => $data]);
        }

        return response()->json(['data' => $patient->load(['healthRecords', 'referrals.feedback'])]);
    }

    public function update(PatientRequest $request, Patient $patient, AuditLogger $auditLogger)
    {
        $this->authorizePatient($request, $patient);
        $patient->update($this->normalizeProfileFields($request->validated(), $patient));
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

    private function normalizeProfileFields(array $data, ?Patient $patient = null): array
    {
        foreach ([
            'occupation',
            'philhealth_status',
            'philhealth_number',
            'spouse_name',
            'spouse_occupation',
        ] as $field) {
            if (array_key_exists($field, $data) && $data[$field] === '') {
                $data[$field] = null;
            }
        }

        $effectiveRegistrationType = $data['registration_type'] ?? $patient?->registration_type;
        $effectiveBirthdate = $data['birthdate'] ?? $patient?->birthdate;
        $effectiveCivilStatus = $data['civil_status'] ?? $patient?->civil_status;
        $effectivePhilhealthStatus =
            $data['philhealth_status'] ?? $patient?->philhealth_status;

        $isChild = $effectiveRegistrationType === 'child';

        if (! $isChild && $effectiveBirthdate) {
            $isChild = Carbon::parse($effectiveBirthdate)->age < 18;
        }

        if (
            array_key_exists('philhealth_status', $data)
            && $effectivePhilhealthStatus !== 'With PhilHealth'
        ) {
            $data['philhealth_number'] = null;
        }

        $profileDecisionChanged = $patient === null
            || array_key_exists('registration_type', $data)
            || array_key_exists('birthdate', $data)
            || array_key_exists('civil_status', $data);

        if ($isChild && $profileDecisionChanged) {
            $data['occupation'] = null;
            $data['spouse_name'] = null;
            $data['spouse_occupation'] = null;

            return $data;
        }

        if ($profileDecisionChanged && $effectiveCivilStatus !== 'Married') {
            $data['spouse_name'] = null;
            $data['spouse_occupation'] = null;
        }

        return $data;
    }
}
