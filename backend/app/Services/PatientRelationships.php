<?php

namespace App\Services;

use App\Models\Household;
use App\Models\Patient;
use App\Models\PatientRelationship;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Explicit spouse/sibling links between two current members of one household.
 * Parent-child stays on mother_patient_id / father_patient_id; a pair that is
 * already parent and child, or ancestor and descendant, can never also be linked here.
 * Callers run these inside a DB transaction (registration already does).
 */
class PatientRelationships
{
    private const MAX_GENERATIONS = 20;

    public function __construct(private AuditLogger $audit, private FacilityAccessService $access) {}

    public function create(Request $request, Household $household, Patient $patient, Patient $relative, string $type, string $field = 'relationship'): PatientRelationship
    {
        $this->assertType($type, $field);
        if ($patient->id === $relative->id) {
            $this->fail($field, 'A patient cannot be connected to themselves.');
        }
        $this->authorize($request, $household, $patient, $relative, $field);
        $this->assertPairFree($patient, $relative, null, $field);
        [$low, $high] = $this->canonical($patient, $relative);
        $link = PatientRelationship::create([...HouseholdOwner::fromHousehold($household)->attributes(), 'patient_id' => $low, 'relative_id' => $high, 'type' => $type, 'created_by' => $request->user()?->id]);
        $this->audit->log($request, 'relationship_created', 'households', "Patients {$low} and {$high}: {$type} link created in household {$household->id}.");

        return $link;
    }

    public function change(Request $request, Household $household, PatientRelationship $link, string $type, string $field = 'relationship'): PatientRelationship
    {
        $this->assertType($type, $field);
        [$patient, $relative] = $this->membersOf($household, $link);
        $this->authorize($request, $household, $patient, $relative, $field);
        $this->assertPairFree($patient, $relative, $link->id, $field);
        $link->update(['type' => $type]);
        $this->audit->log($request, 'relationship_updated', 'households', "Patients {$link->patient_id} and {$link->relative_id}: link changed to {$type} in household {$household->id}.");

        return $link;
    }

    public function remove(Request $request, Household $household, PatientRelationship $link): void
    {
        [$patient, $relative] = $this->membersOf($household, $link);
        $this->authorize($request, $household, $patient, $relative, 'relationship');
        $link->delete();
        $this->audit->log($request, 'relationship_removed', 'households', "Patients {$link->patient_id} and {$link->relative_id}: {$link->type} link removed from household {$household->id}.");
    }

    /** Rejects a pair that is already linked, or already parent and child / ancestor and descendant. */
    public function assertPairFree(Patient $a, Patient $b, ?int $ignoreId = null, string $field = 'relationship'): void
    {
        [$low, $high] = $this->canonical($a, $b);
        $linked = PatientRelationship::where('patient_id', $low)->where('relative_id', $high)
            ->when($ignoreId, fn ($query) => $query->whereKeyNot($ignoreId))->exists();
        if ($linked) {
            $this->fail($field, 'These two patients are already connected.');
        }
        if ($this->isAncestor($a->id, $b->id) || $this->isAncestor($b->id, $a->id)) {
            $this->fail($field, 'A parent, child, grandparent or other direct ancestor cannot also be a spouse or sibling.');
        }
    }

    /**
     * A new parent changes ancestry for this patient and all their descendants.
     * None of their spouses/siblings may become an ancestor through this link.
     */
    public function assertParentLinkAllowed(Patient $patient, int $parentId, string $field): void
    {
        if ($patient->id === $parentId || $this->isAncestor($patient->id, $parentId)) {
            $this->fail($field, 'A patient or their descendant cannot be selected as their parent.');
        }
        $descendants = $this->descendantsOf($patient->id, $field);
        $partners = PatientRelationship::where(fn ($query) => $query
            ->whereIn('patient_id', $descendants)->orWhereIn('relative_id', $descendants))->get()
            ->flatMap(fn (PatientRelationship $link) => [(int) $link->patient_id, (int) $link->relative_id])
            ->reject(fn (int $id) => in_array($id, $descendants, true))->unique();
        foreach ($partners as $partnerId) {
            if ($partnerId === $parentId || $this->isAncestor($partnerId, $parentId)) {
                $this->fail($field, 'This parent link would make a spouse or sibling a direct ancestor. Review the existing family connections first.');
            }
        }
    }

    /** Shared by existing patient updates and atomic registration confirmation. */
    public function assertParentCandidate(Request $request, ?Patient $child, Patient $parent, string $role, string $field): void
    {
        $this->access->authorizePatient($request->user(), $parent);
        $sex = match ($role) {
            'mother' => 'Female', 'father' => 'Male', default => null
        };
        if ($sex === null || $parent->sex !== $sex) {
            $this->fail($field, 'Choose the correct Mother/Father role for the registered parent.');
        }
        if ($child && $child->id === $parent->id) {
            $this->fail($field, 'A patient cannot be linked as their own parent.');
        }
        if (! $child || (int) $child->{$role.'_patient_id'} !== (int) $parent->id) {
            if ($parent->status === 'inactive' || $child?->status === 'inactive') {
                $this->fail($field, 'An inactive patient cannot receive a new parent connection.');
            }
            if ($child) {
                $this->assertParentLinkAllowed($child, $parent->id, $field);
            }
        }
    }

    /** Caller holds the registration transaction/facility lock; never replaces a saved parent. */
    public function confirmParentLink(Request $request, Patient $child, Patient $parent, string $role, bool $existingChild, string $field): void
    {
        $this->access->authorizePatientModification($request->user(), $child);
        if ($existingChild) {
            ActionPermissions::ensure($request->user(), 'families.view');
            ActionPermissions::ensure($request->user(), 'families.manage');
        }
        $this->assertParentCandidate($request, $child, $parent, $role, $field);
        $column = $role.'_patient_id';
        if ($child->{$column} && (int) $child->{$column} !== (int) $parent->id) {
            $this->fail($field, 'A parent is already linked. Keep the household label only, or review the saved connection in Families.');
        }
        if ((int) $child->{$column} === (int) $parent->id) {
            return;
        }
        $child->update([$column => $parent->id]);
        $this->audit->log($request, 'parent_links_updated', 'patients', "Patient {$child->id}: {$column}: none -> {$parent->id}. Confirmed during registration.");
    }

    /** Links whose two people are both current members of the household. */
    public function forHousehold(Household $household): Collection
    {
        $ids = $household->members()->pluck('id');

        return HouseholdOwner::fromHousehold($household)->scopeRelationships(PatientRelationship::query())
            ->whereIn('patient_id', $ids)->whereIn('relative_id', $ids)->orderBy('id')->get();
    }

    private function assertType(string $type, string $field): void
    {
        if (! in_array($type, PatientRelationship::TYPES, true)) {
            $this->fail($field, 'Choose spouse or sibling.');
        }
    }

    private function authorize(Request $request, Household $household, Patient $patient, Patient $relative, string $field): void
    {
        $this->access->authorizePatientModification($request->user(), $patient);
        $owner = HouseholdOwner::fromHousehold($household);
        abort_unless($owner->ownsPatient($patient) && $owner->ownsPatient($relative), 404);
        foreach ([$patient, $relative] as $person) {
            if ($person->status === 'inactive') {
                $this->fail($field, 'An inactive patient cannot be connected.');
            }
            if ((int) $person->household_id !== (int) $household->id) {
                $this->fail($field, 'Both patients must be current members of this household.');
            }
        }
    }

    /** @return array{0: Patient, 1: Patient} */
    private function membersOf(Household $household, PatientRelationship $link): array
    {
        $patient = Patient::find($link->patient_id);
        $relative = Patient::find($link->relative_id);
        $owner = HouseholdOwner::fromHousehold($household);
        abort_unless($patient && $relative
            && (int) $link->barangay_health_center_id === (int) $household->barangay_health_center_id
            && (int) $link->rural_health_unit_id === (int) $household->rural_health_unit_id
            && $owner->ownsPatient($patient) && $owner->ownsPatient($relative)
            && (int) $patient->household_id === (int) $household->id && (int) $relative->household_id === (int) $household->id, 404);

        return [$patient, $relative];
    }

    /** @return array{0: int, 1: int} */
    private function canonical(Patient $a, Patient $b): array
    {
        return [min($a->id, $b->id), max($a->id, $b->id)];
    }

    /** Includes the patient; used only to validate effects of a proposed parent link. */
    private function descendantsOf(int $patientId, string $field): array
    {
        $seen = [$patientId];
        $frontier = [$patientId];
        for ($generation = 0; $generation < self::MAX_GENERATIONS && $frontier; $generation++) {
            $children = Patient::where(fn ($query) => $query
                ->whereIn('mother_patient_id', $frontier)->orWhereIn('father_patient_id', $frontier))
                ->pluck('id')->map(fn ($id) => (int) $id)->all();
            $frontier = array_values(array_diff($children, $seen));
            $seen = array_merge($seen, $frontier);
        }
        if ($frontier) {
            $this->fail($field, 'This family has too many generations to verify safely. Review the existing family connections first.');
        }

        return $seen;
    }

    /** Bounded walk up mother/father links, safe against cycles in bad imported data. */
    private function isAncestor(int $candidate, int $person): bool
    {
        $frontier = [$person];
        $seen = [$person => true];
        for ($generation = 0; $generation < self::MAX_GENERATIONS && $frontier; $generation++) {
            $parents = Patient::whereIn('id', $frontier)->get(['id', 'mother_patient_id', 'father_patient_id'])
                ->flatMap(fn (Patient $row) => [$row->mother_patient_id, $row->father_patient_id])
                ->filter()->map(fn ($id) => (int) $id)->unique()->values()->all();
            if (in_array($candidate, $parents, true)) {
                return true;
            }
            $frontier = array_values(array_filter($parents, fn (int $id) => ! isset($seen[$id])));
            foreach ($frontier as $id) {
                $seen[$id] = true;
            }
        }

        if ($frontier) {
            $this->fail('relationship', 'This ancestry is too deep to verify safely. Review the existing family connections first.');
        }

        return false;
    }

    private function fail(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
