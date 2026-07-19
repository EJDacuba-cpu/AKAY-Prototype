<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PatientRequest;
use App\Models\Patient;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Support\StoredFunction;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class PatientController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    public function index(Request $request)
    {
        if (StoredFunction::available() && $request->user()->isAdmin()) {
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

        $user = $request->user();
        $query = $this->facilityAccess
            ->scopePatients(Patient::query(), $user)
            ->with([
                'barangayHealthCenter',
                'ruralHealthUnit',
                'mother' => fn ($query) => $this->facilityAccess
                    ->scopePatients($query, $user),
            ]);

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
        $this->authorizeMotherLink($request, $data['mother_patient_id'] ?? null);
        $user = $request->user();
        $data['created_by'] = $user->id;

        if ($user->isBhw()) {
            unset($data['rural_health_unit_id']);
            $data['barangay_health_center_id'] = $user->barangay_health_center_id;
            $data['rural_health_unit_id'] = null;
        }

        if ($user->isRhuStaff()) {
            unset($data['barangay_health_center_id']);
            $data['barangay_health_center_id'] = null;
            $data['rural_health_unit_id'] = $user->rural_health_unit_id;
        }

        $patient = Patient::create($data);
        $auditLogger->log($request, 'created', 'patients', "Created patient {$patient->full_name}.");

        return response()->json(['data' => $patient->load(['barangayHealthCenter', 'ruralHealthUnit', 'mother'])], 201);
    }

    public function show(Request $request, Patient $patient)
    {
        $this->facilityAccess->authorizePatient($request->user(), $patient);

        if (StoredFunction::available() && $request->user()->isAdmin()) {
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

        $user = $request->user();
        $patient->load([
            'healthRecords' => fn ($query) => $this->facilityAccess
                ->scopePatientHealthRecords($query, $user),
            'referrals' => fn ($query) => $this->facilityAccess
                ->scopeReferrals($query, $user)
                ->with('feedback'),
            'mother' => fn ($query) => $this->facilityAccess
                ->scopePatients($query, $user),
        ]);
        $patient->loadCount([
            'healthRecords' => fn ($query) => $this->facilityAccess
                ->scopePatientHealthRecords($query, $user),
            'referrals' => fn ($query) => $this->facilityAccess
                ->scopeReferrals($query, $user),
        ]);

        return response()->json(['data' => $patient]);
    }

    public function update(PatientRequest $request, Patient $patient, AuditLogger $auditLogger)
    {
        $this->facilityAccess->authorizePatientModification($request->user(), $patient);
        $data = $this->normalizeProfileFields($request->validated(), $patient);
        if (! $request->user()->isAdmin()) {
            unset(
                $data['barangay_health_center_id'],
                $data['rural_health_unit_id'],
                $data['facility_id']
            );
        }
        $this->authorizeMotherLink($request, $data['mother_patient_id'] ?? null);
        $patient->update($data);
        $auditLogger->log($request, 'updated', 'patients', "Updated patient {$patient->full_name}.");

        return response()->json(['data' => $patient->fresh()->load(['barangayHealthCenter', 'ruralHealthUnit', 'mother'])]);
    }

    public function destroy(Request $request, Patient $patient, AuditLogger $auditLogger)
    {
        $this->facilityAccess->authorizePatientModification($request->user(), $patient);
        $patient->update(['status' => 'inactive']);
        $auditLogger->log($request, 'deactivated', 'patients', "Deactivated patient {$patient->full_name}.");

        return response()->json(['data' => $patient->fresh()]);
    }

    private function authorizeMotherLink(Request $request, mixed $motherPatientId): void
    {
        if (! $motherPatientId) {
            return;
        }

        $currentPatient = $request->route('patient');
        abort_if(
            $currentPatient instanceof Patient
                && (string) $currentPatient->id === (string) $motherPatientId,
            422,
            'A patient cannot be linked as their own mother.'
        );

        $mother = Patient::find($motherPatientId);
        abort_unless($mother, 422, 'Selected mother patient was not found.');
        $this->facilityAccess->authorizePatient($request->user(), $mother);
    }

    private function normalizeProfileFields(array $data, ?Patient $patient = null): array
    {
        foreach ([
            'occupation',
            'philhealth_status',
            'philhealth_number',
            'spouse_name',
            'spouse_occupation',
            'purok_area',
            'nhts_status',
            'family_serial_number',
            'mother_patient_id',
        ] as $field) {
            if (array_key_exists($field, $data) && $data[$field] === '') {
                $data[$field] = null;
            }
        }

        $effectiveBirthdate = $data['birthdate'] ?? $patient?->birthdate;
        $effectiveCivilStatus = $data['civil_status'] ?? $patient?->civil_status;
        $effectivePhilhealthStatus =
            $data['philhealth_status'] ?? $patient?->philhealth_status;

        $isEpiInfant = false;

        if ($effectiveBirthdate) {
            $isEpiInfant = Carbon::parse($effectiveBirthdate)
                ->diffInMonths(now()) <= 12;
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

        if ($isEpiInfant && $profileDecisionChanged) {
            $data['civil_status'] = 'Single';
            $data['occupation'] = null;
            $data['nhts_status'] = null;
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
