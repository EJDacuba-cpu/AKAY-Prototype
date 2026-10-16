<?php

namespace App\Services;

use App\Models\Household;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class Households
{
    public function __construct(private HouseholdSerialAllocator $serials, private FacilityAccessService $access) {}

    public function bhc(User $user): int
    {
        abort_unless($user->isBhc(), 403, 'An active BHC assignment is required.');
        $this->access->ensureValidFacilityAssignment($user);

        return (int) $user->barangay_health_center_id;
    }

    public function find(int $bhc, int $id): Household
    {
        return Household::where('barangay_health_center_id', $bhc)->findOrFail($id);
    }

    public function lock(int $bhc): void
    {
        $this->serials->lock($bhc);
    }

    /** Relationships are only included where callers need the graph (not in directory listings). */
    public function response(Household $household, bool $withRelationships = true): array
    {
        $data = [...$household->only(['id', 'barangay_health_center_id', 'serial_number', 'address', 'head_patient_id', 'archived_at', 'version']),
            'members' => $household->members()->orderBy('id')->get()->map(fn (Patient $p) => PatientIdentity::householdResponse($p))->all()];
        if ($withRelationships) {
            $data['relationships'] = app(PatientRelationships::class)->forHousehold($household)
                ->map(fn ($link) => $link->only(['id', 'patient_id', 'relative_id', 'type']))->values()->all();
        }

        return $data;
    }

    public function checkVersion(Household $household, mixed $version): void
    {
        abort_unless((int) $version === $household->version, 409, 'This household changed. Reload it and review your changes before saving.');
    }

    private function adult(Patient $patient, string $field): void
    {
        if (! $patient->birthdate || $patient->birthdate->age < 18) {
            throw ValidationException::withMessages([$field => 'The household head must be an explicitly selected adult with a birth date.']);
        }
    }

    public function validateHeadPatient(Patient $patient): void
    {
        if ($patient->household_id && Household::whereKey($patient->household_id)->where('head_patient_id', $patient->id)->exists()) {
            $this->adult($patient, 'birthdate');
        }
    }

    public function validateLegacySerial(int $bhc, array $data, ?Patient $patient = null): void
    {
        if (! array_key_exists('family_serial_number', $data) || $data['family_serial_number'] === null) {
            return;
        }
        $serial = mb_strtoupper(trim($data['family_serial_number']));
        if ($patient && $serial === mb_strtoupper(trim((string) $patient->family_serial_number))) {
            return;
        }
        if ($serial !== '' && Household::where('barangay_health_center_id', $bhc)->where('serial_number', $serial)->exists()) {
            throw ValidationException::withMessages(['family_serial_number' => 'This FSN belongs to a registered household. Select that household to join it.']);
        }
    }

    public function create(int $bhc, array $input, string $prefix = ''): Household
    {
        $this->serials->lock($bhc);
        $serial = ($input['serial_mode'] ?? 'auto') === 'manual'
            ? $this->serials->manual($bhc, (string) ($input['serial_number'] ?? ''), $prefix.'serial_number')
            : $this->serials->allocate($bhc);

        return Household::create(['barangay_health_center_id' => $bhc, 'serial_number' => $serial, 'address' => $input['address'] ?? [], 'version' => 1]);
    }

    public function attach(Request $request, Patient $patient, array $input, ?array $replacement = null): Household
    {
        $bhc = $this->bhc($request->user());
        abort_unless((int) $patient->barangay_health_center_id === $bhc && $patient->rural_health_unit_id === null, 404);
        $this->serials->lock($bhc);
        // Another request may already have moved this person while we waited.
        $patient->refresh();
        $source = $patient->household_id ? $this->find($bhc, $patient->household_id) : null;
        $target = $input['kind'] === 'existing' ? $this->find($bhc, (int) $input['household_id']) : null;
        if ($target?->archived_at) {
            throw ValidationException::withMessages(['household.household_id' => 'This household is archived. Select an active household.']);
        }
        if ($target && isset($input['version'])) {
            $this->checkVersion($target, $input['version']);
        }
        if ($source && (! $target || $source->id !== $target->id)) {
            $this->depart($request, $source, $patient, $replacement);
        }
        if (! $target) {
            $this->adult($patient, 'household');
            $target = $this->create($bhc, $input, 'household.');
            $target->head_patient_id = $patient->id;
        }
        $relationship = $target->head_patient_id === $patient->id ? 'Household head' : trim((string) ($input['relationship'] ?? ''));
        if ($relationship === '' || ($target->head_patient_id !== $patient->id && in_array(mb_strtolower($relationship), ['head', 'household head'], true))) {
            throw ValidationException::withMessages(['household.relationship' => 'Choose the member’s relationship to the current household head.']);
        }
        $address = [];
        foreach (['streetAddress' => 'street_address', 'purokArea' => 'purok_area', 'barangay' => 'barangay', 'municipality' => 'municipality'] as $key => $field) {
            if (array_key_exists($key, $target->address ?? [])) {
                $address[$field] = $target->address[$key];
            }
        }
        if ($target->head_patient_id !== $patient->id) {
            // A saved legacy label is only kept while the member stays in the same household.
            $current = (int) $patient->household_id === $target->id ? $patient->relationship_to_household_head : null;
            RelationshipLabels::validate($relationship, $current, 'household.relationship');
        }
        $patient->update([...$address, 'household_id' => $target->id, 'family_serial_number' => $target->serial_number, 'relationship_to_household_head' => $relationship]);
        $this->confirmLink($request, $target, $patient, $relationship, $input['relationship_link']['type'] ?? null);
        $target->version++;
        $target->save();
        app(AuditLogger::class)->log($request, 'membership_updated', 'households', "Patient {$patient->id} joined household {$target->id}.");

        return $target;
    }

    /** An explicit, staff-confirmed spouse/sibling link between the saved patient and the household head. */
    private function confirmLink(Request $request, Household $target, Patient $patient, string $relationship, ?string $type): void
    {
        if ($type === null) {
            return;
        }
        $field = 'household.relationship_link';
        if ($target->head_patient_id === $patient->id) {
            throw ValidationException::withMessages([$field => 'A household head cannot be linked to themselves.']);
        }
        if (RelationshipLabels::linkTypeFor($relationship) !== $type) {
            throw ValidationException::withMessages([$field => 'Only Husband or Wife can be recorded as spouse, and Brother or Sister as sibling.']);
        }
        app(PatientRelationships::class)->create($request, $target, $patient, Patient::findOrFail($target->head_patient_id), $type, $field);
    }

    private function depart(Request $request, Household $source, Patient $patient, ?array $replacement): void
    {
        $remaining = $source->members()->whereKeyNot($patient->id)->get();
        if ((int) $source->head_patient_id === $patient->id && $remaining->isNotEmpty()) {
            if (! $replacement || (int) ($replacement['household_id'] ?? 0) !== $source->id) {
                throw ValidationException::withMessages(['head_replacement' => 'Select a replacement head and review every remaining member’s relationship before moving this head.']);
            }
            $this->checkVersion($source, $replacement['version'] ?? null);
            $this->head($source, (int) $replacement['head_patient_id'], $replacement['relationships'] ?? [], $patient->id);
        } elseif ($remaining->isEmpty()) {
            $source->head_patient_id = null;
            $source->archived_at = now();
        }
        $source->version++;
        $source->save();
        app(AuditLogger::class)->log($request, 'membership_departed', 'households', "Patient {$patient->id} left household {$source->id}.");
    }

    public function head(Household $household, int $headId, array $relationships, ?int $departing = null): void
    {
        $head = $household->members()->whereKey($headId)->whereKeyNot($departing ?? 0)->first();
        if (! $head) {
            throw ValidationException::withMessages(['head_patient_id' => 'The head must be a member of this household.']);
        }
        $this->adult($head, 'head_patient_id');
        $members = $household->members()->whereKeyNot($departing ?? 0)->get();
        $headChanged = (int) $household->head_patient_id !== $headId || $departing !== null;
        foreach ($members as $member) {
            $relation = $member->id === $headId ? 'Household head' : trim((string) ($relationships[$member->id] ?? ($headChanged ? '' : $member->relationship_to_household_head)));
            if ($relation === '' || mb_strlen($relation) > 100 || ($member->id !== $headId && in_array(mb_strtolower($relation), ['head', 'household head'], true))) {
                throw ValidationException::withMessages(['relationships.'.$member->id => 'Review the relationship of every member to the selected head.']);
            }
            if ($member->id !== $headId && array_key_exists($member->id, $relationships)) {
                RelationshipLabels::validate($relation, $member->relationship_to_household_head, 'relationships.'.$member->id);
            }
            $member->update(['relationship_to_household_head' => $relation]);
        }
        foreach (array_keys($relationships) as $id) {
            if (! $members->contains('id', (int) $id)) {
                throw ValidationException::withMessages(['relationships' => 'Relationships may only reference members of this household.']);
            }
        }
        $household->head_patient_id = $headId;
    }

    public function update(Request $request, Household $household, array $data): Household
    {
        $this->serials->lock($household->barangay_health_center_id);
        $household->refresh();
        $this->checkVersion($household, $data['version']);
        $old = $household->serial_number;
        if (array_key_exists('serial_number', $data)) {
            $household->serial_number = $this->serials->manual($household->barangay_health_center_id, $data['serial_number'], 'serial_number', $household->id);
            $household->members()->update(['family_serial_number' => $household->serial_number]);
        }
        if (isset($data['address'])) {
            $household->address = $data['address'];
            $household->members()->update([
                'street_address' => $data['address']['streetAddress'],
                'purok_area' => $data['address']['purokArea'],
                'barangay' => $data['address']['barangay'],
                'municipality' => $data['address']['municipality'],
            ]);
        }
        if (isset($data['head_patient_id']) || isset($data['relationships'])) {
            $this->head($household, (int) ($data['head_patient_id'] ?? $household->head_patient_id), $data['relationships'] ?? []);
        }
        $household->version++;
        $household->save();
        app(AuditLogger::class)->log($request, 'updated', 'households', "Household {$household->id}: FSN {$old} → {$household->serial_number}.");

        return $household;
    }
}
