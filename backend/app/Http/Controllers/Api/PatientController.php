<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PatientRequest;
use App\Models\Patient;
use App\Services\ActionPermissions;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\Households;
use App\Services\PatientDetail;
use App\Services\PatientIdentity;
use App\Services\PatientRelationships;
use App\Support\StoredFunction;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PatientController extends Controller
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess
    ) {}

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
            $query->where(function ($q) use ($search): void {
                if (ctype_digit((string) $search)) {
                    $q->orWhereKey((int) $search);
                }

                $q->orWhere('first_name', 'like', "%{$search}%")
                    ->orWhere('middle_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('philhealth_number', 'like', "%{$search}%")
                    ->orWhere('contact_number', 'like', "%{$search}%")
                    ->orWhere('barangay', 'like', "%{$search}%");
            });
        }

        foreach (['patient_category', 'barangay', 'status'] as $filter) {
            if ($request->query($filter)) {
                $query->where($filter, $request->query($filter));
            }
        }

        $results = $query->latest()->paginate($request->integer('per_page', 25));
        if (! $user->isAdmin() && ! ActionPermissions::allows($user, 'clinical.history')) {
            $results->through(fn (Patient $patient) => PatientIdentity::response($patient));
        }

        return response()->json(['data' => $results]);
    }

    /**
     * The household behind a Family Serial Number: every active patient the
     * user can see who shares the serial, oldest first so the parents lead.
     * Identity fields only - it is a picker for linking a child's parents.
     */
    public function household(Request $request)
    {
        $serial = trim((string) $request->validate([
            'serial' => ['required', 'string', 'max:100'],
        ])['serial']);

        $members = $this->facilityAccess
            ->scopePatients(Patient::query(), $request->user())
            ->where('family_serial_number', $serial)
            ->where(fn ($query) => $query
                ->whereNull('status')
                ->orWhere('status', '!=', 'inactive'))
            ->orderByRaw('birthdate IS NULL, birthdate')
            ->limit(50)
            ->get()
            ->map(fn (Patient $patient) => [
                ...$patient->only(['id', 'first_name', 'middle_name', 'last_name', 'sex', 'age']),
                'birthdate' => $patient->birthdate?->toDateString(),
                'full_name' => $patient->full_name,
            ]);

        return response()->json(['data' => $members]);
    }

    public function store(PatientRequest $request, AuditLogger $auditLogger)
    {
        $data = $this->normalizeProfileFields($request->validated());
        $this->authorizeParentLinks($request, $data);
        $user = $request->user();
        $canAccessHistory = $user->isAdmin() || ActionPermissions::allows($user, 'clinical.history');
        $data['created_by'] = $user->id;

        if ($user->isBhc()) {
            unset($data['rural_health_unit_id']);
            $data['barangay_health_center_id'] = $user->barangay_health_center_id;
            $data['rural_health_unit_id'] = null;
        }

        if ($user->isRhu()) {
            unset($data['barangay_health_center_id']);
            $data['barangay_health_center_id'] = null;
            $data['rural_health_unit_id'] = $user->rural_health_unit_id;
        }

        $householdInput = $data['household'] ?? null;
        unset($data['household'], $data['head_replacement']);
        $patient = DB::transaction(function () use ($request, $data, $householdInput, $auditLogger) {
            $user = $request->user();
            if ($user->isBhc() || $user->isRhu()) {
                $households = app(Households::class);
                $owner = $households->owner($user);
                $households->lock($owner);
                $households->validateLegacySerial($owner, $data);
            }
            if ($householdInput) {
                app(Households::class)->owner($request->user());
                ActionPermissions::ensure($request->user(), 'patients.register');
                if (! empty($data['family_serial_number'])) {
                    throw ValidationException::withMessages(['family_serial_number' => 'Choose the FSN through the household selection.']);
                }
            }
            $patient = Patient::create($data);
            if ($householdInput) {
                app(Households::class)->attach($request, $patient, $householdInput);
            }
            $auditLogger->log($request, 'created', 'patients', "Created patient {$patient->full_name}.");

            return $patient;
        });

        $patient->load(['barangayHealthCenter', 'ruralHealthUnit', 'mother', 'father', 'household']);
        if (! $canAccessHistory) {
            $response = $patient->makeHidden(['medical_background', 'mother', 'father'])->toArray();
            $response['mother'] = $patient->mother ? PatientIdentity::response($patient->mother) : null;
            $response['father'] = $patient->father ? PatientIdentity::response($patient->father) : null;

            return response()->json(['data' => $response], 201);
        }

        return response()->json(['data' => $patient], 201);
    }

    public function show(Request $request, Patient $patient)
    {
        $this->facilityAccess->authorizePatient($request->user(), $patient);

        if (! $request->user()->isAdmin() && ! ActionPermissions::allows($request->user(), 'clinical.history')) {
            return response()->json(['data' => PatientIdentity::response($patient)]);
        }

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

        return response()->json(['data' => app(PatientDetail::class)->for($patient, $request->user())]);
    }

    public function update(PatientRequest $request, Patient $patient, AuditLogger $auditLogger)
    {
        $this->facilityAccess->authorizePatientModification($request->user(), $patient);
        $data = $this->normalizeProfileFields($request->validated(), $patient);
        $householdInput = $data['household'] ?? null;
        $replacement = $data['head_replacement'] ?? null;
        unset($data['household'], $data['head_replacement']);
        if (! $request->user()->isAdmin() && ! ActionPermissions::allows($request->user(), 'clinical.history')) {
            $data = array_intersect_key($data, array_flip(PatientIdentity::FIELDS));
        }
        if (! $request->user()->isAdmin()) {
            unset(
                $data['barangay_health_center_id'],
                $data['rural_health_unit_id'],
                $data['facility_id']
            );
        }
        $this->authorizeParentLinks($request, $data);
        DB::transaction(function () use ($request, $patient, $data, $householdInput, $replacement, $auditLogger) {
            $user = $request->user();
            if ($user->isBhc() || $user->isRhu()) {
                // Acquire the same facility lock before any patient row write;
                // FSN corrections lock in this order too, avoiding deadlocks.
                $households = app(Households::class);
                $owner = $households->owner($user);
                $households->lock($owner);
                $patient->refresh();
                if (! $patient->household_id) {
                    $households->validateLegacySerial($owner, $data, $patient);
                }
            }
            if ($householdInput) {
                app(Households::class)->owner($request->user());
                ActionPermissions::ensure($request->user(), 'patients.register');
            }
            if ($patient->household_id && array_key_exists('family_serial_number', $data) && $data['family_serial_number'] !== $patient->family_serial_number) {
                throw ValidationException::withMessages(['family_serial_number' => 'Use Edit Family to correct the household FSN.']);
            }
            if ($patient->household_id && ! $householdInput) {
                $this->guardHouseholdAddress($patient, $data);
            }
            if ($householdInput && ! empty($data['family_serial_number']) && ! $patient->household_id) {
                throw ValidationException::withMessages(['family_serial_number' => 'Choose the FSN through the household selection.']);
            }
            $patient->update($data);
            if ($householdInput) {
                app(Households::class)->attach($request, $patient, $householdInput, $replacement);
            }
            app(Households::class)->validateHeadPatient($patient);
            $auditLogger->log($request, 'updated', 'patients', "Updated patient {$patient->full_name}.");
        });

        return response()->json(['data' => ! $request->user()->isAdmin() && ! ActionPermissions::allows($request->user(), 'clinical.history')
            ? PatientIdentity::response($patient->fresh())
            : $patient->fresh()->load(['barangayHealthCenter', 'ruralHealthUnit', 'mother', 'father', 'household'])]);
    }

    public function destroy(Request $request, Patient $patient, AuditLogger $auditLogger)
    {
        $this->facilityAccess->authorizePatientModification($request->user(), $patient);
        $patient->update(['status' => 'inactive']);
        $auditLogger->log($request, 'deactivated', 'patients', "Deactivated patient {$patient->full_name}.");

        return response()->json(['data' => $patient->fresh()]);
    }

    /** A household member's address belongs to the household; only Edit Family (or a household move) changes it. */
    private function guardHouseholdAddress(Patient $patient, array $data): void
    {
        foreach (['street_address', 'purok_area', 'barangay', 'municipality'] as $field) {
            if (array_key_exists($field, $data) && trim((string) $data[$field]) !== trim((string) $patient->{$field})) {
                throw ValidationException::withMessages([$field => 'Use Edit Family to change the household address.']);
            }
        }
    }

    /**
     * A linked mother or father must be a registered patient the user can see,
     * of the matching sex, and not the patient themself.
     */
    private function authorizeParentLinks(Request $request, array $data): void
    {
        foreach (['mother' => 'Female', 'father' => 'Male'] as $role => $sex) {
            $parentId = $data["{$role}_patient_id"] ?? null;
            if (! $parentId) {
                continue;
            }

            $currentPatient = $request->route('patient');
            abort_if(
                $currentPatient instanceof Patient
                    && (string) $currentPatient->id === (string) $parentId,
                422,
                "A patient cannot be linked as their own {$role}."
            );

            $parent = Patient::find($parentId);
            abort_unless($parent, 422, "Selected {$role} patient was not found.");
            $this->facilityAccess->authorizePatient($request->user(), $parent);
            abort_unless(
                $parent->sex === $sex,
                422,
                "The linked {$role} must be a {$sex} patient."
            );
            if ($currentPatient instanceof Patient && (int) $currentPatient->{"{$role}_patient_id"} !== (int) $parentId) {
                app(PatientRelationships::class)->assertParentLinkAllowed($currentPatient, (int) $parentId, "{$role}_patient_id");
            }
        }
    }

    private function normalizeProfileFields(array $data, ?Patient $patient = null): array
    {
        foreach ([
            'occupation',
            'education_level',
            'education_completed',
            'philhealth_status',
            'philhealth_number',
            'spouse_name',
            'spouse_occupation',
            'purok_area',
            'nhts_status',
            'family_serial_number',
            'mother_patient_id',
            'father_patient_id',
            'mother_birth_date',
            'father_birth_date',
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
