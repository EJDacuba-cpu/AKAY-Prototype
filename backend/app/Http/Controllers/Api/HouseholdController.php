<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Household;
use App\Models\Patient;
use App\Models\PatientRelationship;
use App\Services\ActionPermissions;
use App\Services\HouseholdOwner;
use App\Services\Households;
use App\Services\PatientIdentity;
use App\Services\PatientRelationships;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HouseholdController extends Controller
{
    public function __construct(private Households $households) {}

    public function index(Request $request)
    {
        return $this->listing($request, false);
    }

    public function lookup(Request $request)
    {
        return $this->listing($request, true);
    }

    public function candidates(Request $request)
    {
        $owner = $this->owner($request);
        ActionPermissions::ensure($request->user(), 'families.manage');
        $data = $request->validate(['search' => ['nullable', 'string', 'max:100'], 'page' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $query = $owner->scopePatients(Patient::query())->with(['household' => fn ($q) => $q->withCount('members')])->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'inactive'));
        if ($search = trim($data['search'] ?? '')) {
            $needle = '%'.mb_strtolower($search).'%';
            $query->where(fn ($q) => $q->whereRaw('LOWER(first_name) LIKE ?', [$needle])->orWhereRaw('LOWER(last_name) LIKE ?', [$needle])->orWhereRaw('LOWER(family_serial_number) LIKE ?', [$needle]));
        }
        $page = $query->orderBy('last_name')->orderBy('id')->paginate($data['per_page'] ?? 25);

        return response()->json(['data' => $page->getCollection()->map(fn ($patient) => PatientIdentity::householdResponse($patient, true)), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
    }

    private function listing(Request $request, bool $lookup)
    {
        $owner = $this->owner($request);
        if (! ($lookup && ActionPermissions::allows($request->user(), 'patients.register'))) {
            ActionPermissions::ensure($request->user(), 'families.view');
        }
        $data = $request->validate(['search' => ['nullable', 'string', 'max:100'], 'page' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $query = $owner->scopeHouseholds(Household::query())->whereNull('archived_at');
        if ($search = trim($data['search'] ?? '')) {
            $needle = '%'.mb_strtolower($search).'%';
            $query->where(fn ($q) => $q->whereRaw('LOWER(serial_number) LIKE ?', [$needle])->orWhereRaw('LOWER(CAST(address AS TEXT)) LIKE ?', [$needle])->orWhereHas('members', fn ($m) => $m->whereRaw('LOWER(first_name) LIKE ?', [$needle])->orWhereRaw('LOWER(middle_name) LIKE ?', [$needle])->orWhereRaw('LOWER(last_name) LIKE ?', [$needle])));
        }
        $page = $query->orderBy('id', 'desc')->paginate($data['per_page'] ?? 25);

        return response()->json(['data' => $page->getCollection()->map(fn ($h) => $this->households->response($h, false)), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
    }

    public function show(Request $request, int $id)
    {
        $owner = $this->owner($request);
        abort_unless(ActionPermissions::allows($request->user(), 'families.view') || ActionPermissions::allows($request->user(), 'patients.register'), 403);

        return response()->json(['data' => $this->households->response($this->households->find($owner, $id))]);
    }

    public function store(Request $request)
    {
        $owner = $this->owner($request);
        ActionPermissions::ensure($request->user(), 'families.manage');
        $data = $request->validate([
            'head_patient_id' => ['required', 'integer'],
            'serial_mode' => ['required', 'in:auto,manual'],
            'serial_number' => ['required_if:serial_mode,manual', 'nullable', 'string', 'max:100'],
            ...self::addressRules('', true),
            'head_replacement' => ['nullable', 'array:household_id,head_patient_id,relationships,version'],
            'head_replacement.household_id' => ['required_with:head_replacement', 'integer'],
            'head_replacement.head_patient_id' => ['required_with:head_replacement', 'integer'],
            'head_replacement.version' => ['required_with:head_replacement', 'integer', 'min:1'],
            'head_replacement.relationships' => ['present_with:head_replacement', 'array'],
            'head_replacement.relationships.*' => ['required', 'string', 'max:100'],
        ]);
        $household = DB::transaction(function () use ($request, $owner, $data) {
            $this->households->lock($owner);
            $patient = $owner->scopePatients(Patient::query())->findOrFail($data['head_patient_id']);

            return $this->households->attach($request, $patient, ['kind' => 'new', ...$data], $data['head_replacement'] ?? null);
        });

        return response()->json(['data' => $this->households->response($household)], 201);
    }

    public function update(Request $request, int $id)
    {
        $owner = $this->owner($request);
        ActionPermissions::ensure($request->user(), 'families.manage');
        $data = $request->validate(['version' => ['required', 'integer', 'min:1'], 'serial_number' => ['sometimes', 'required', 'string', 'max:100'], 'head_patient_id' => ['sometimes', 'required', 'integer'], 'relationships' => ['sometimes', 'array'], 'relationships.*' => ['required', 'string', 'max:100'], ...self::addressRules()]);
        $household = DB::transaction(fn () => $this->households->update($request, $this->households->find($owner, $id), $data));

        return response()->json(['data' => $this->households->response($household)]);
    }

    public function storeRelationship(Request $request, int $id, PatientRelationships $relationships)
    {
        return $this->relationshipMutation($request, $id, ['patient_id' => ['required', 'integer'], 'relative_id' => ['required', 'integer'], 'type' => ['required', 'string']], 201,
            function (Household $household, array $data, HouseholdOwner $owner) use ($request, $relationships) {
                $people = fn (int $patientId) => $owner->scopePatients(Patient::query())->findOrFail($patientId);
                $relationships->create($request, $household, $people($data['patient_id']), $people($data['relative_id']), $data['type']);
            });
    }

    public function updateRelationship(Request $request, int $id, int $relationshipId, PatientRelationships $relationships)
    {
        return $this->relationshipMutation($request, $id, ['type' => ['required', 'string']], 200,
            function (Household $household, array $data, HouseholdOwner $owner) use ($request, $relationships, $relationshipId) {
                $relationships->change($request, $household, $owner->scopeRelationships(PatientRelationship::query())->findOrFail($relationshipId), $data['type']);
            });
    }

    public function destroyRelationship(Request $request, int $id, int $relationshipId, PatientRelationships $relationships)
    {
        return $this->relationshipMutation($request, $id, [], 200,
            function (Household $household, array $data, HouseholdOwner $owner) use ($request, $relationships, $relationshipId) {
                $relationships->remove($request, $household, $owner->scopeRelationships(PatientRelationship::query())->findOrFail($relationshipId));
            });
    }

    /** Explicit spouse/sibling changes: families.manage, facility scoped, version checked, one transaction. */
    private function relationshipMutation(Request $request, int $id, array $rules, int $status, callable $mutate)
    {
        $owner = $this->owner($request);
        ActionPermissions::ensure($request->user(), 'families.manage');
        $data = $request->validate(['version' => ['required', 'integer', 'min:1'], ...$rules]);
        $household = DB::transaction(function () use ($owner, $id, $data, $mutate) {
            $this->households->lock($owner);
            $household = $this->households->find($owner, $id);
            $this->households->checkVersion($household, $data['version']);
            abort_if($household->archived_at !== null, 404);
            $mutate($household, $data, $owner);
            $household->version++;
            $household->save();

            return $household;
        });

        return response()->json(['data' => $this->households->response($household)], $status);
    }

    public static function addressRules(string $prefix = '', bool $required = false): array
    {
        $presence = $prefix !== '' ? 'required_if:household.kind,new' : ($required ? 'required' : 'sometimes');
        $fieldPresence = $prefix !== '' ? 'required_if:household.kind,new' : ($required ? 'required' : 'required_with:address');
        $rules = [$prefix.'address' => [$presence, 'array:streetAddress,purokArea,barangay,municipality', 'required_array_keys:streetAddress,purokArea,barangay,municipality']];
        foreach (['streetAddress', 'purokArea', 'barangay', 'municipality'] as $field) {
            $rules[$prefix.'address.'.$field] = [$fieldPresence, 'string', 'max:255'];
        }

        return $rules;
    }

    private function owner(Request $request): HouseholdOwner
    {
        $expected = $request->route('householdNamespace');
        $owner = $this->households->owner($request->user());
        abort_unless(! is_string($expected) || $expected === '' || $owner->kind === $expected, 403, $expected === HouseholdOwner::RHU
            ? 'An active RHU assignment is required.'
            : 'An active BHC assignment is required.');

        return $owner;
    }
}
