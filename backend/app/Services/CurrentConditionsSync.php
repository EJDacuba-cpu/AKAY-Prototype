<?php

namespace App\Services;

use App\Models\Patient;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Applies a consultation's diagnoses to the patient's Current Conditions
 * (patients.medical_background.currentDiseases) - ONLY those the user ticked
 * "Add to Current Conditions" for. Nothing is inferred or added on its own.
 *
 * Runs inside the health record's save transaction, so a consultation that
 * fails to save never touches the profile. A condition already on the list
 * (same name, ignoring case and outer spaces) is linked rather than added
 * twice: only its last confirmed date moves to this visit - its existing
 * status is left as the Patient Profile or a prior visit set it, since the
 * consultation modal no longer offers a status choice for an existing match.
 */
class CurrentConditionsSync
{
    /** Same statuses the Patient Profile's Current Conditions editor offers. */
    public const STATUSES = ['Active', 'Controlled', 'Resolved'];

    /** Mirrors PatientRequest's medical_background.currentDiseases max. */
    private const MAX_CONDITIONS = 50;

    public function canSync(User $user): bool
    {
        return $user->isAdmin() || ActionPermissions::allows($user, 'clinical.history');
    }

    /**
     * Current Conditions are clinical history: a user who may not edit them on
     * the profile may not edit them through a consultation either.
     */
    public function assertAllowed(User $user, array $diagnoses): void
    {
        if ($this->canSync($user)) {
            return;
        }
        foreach ($diagnoses as $index => $diagnosis) {
            if (($diagnosis['addToConditions'] ?? false) === true) {
                throw ValidationException::withMessages([
                    "diagnoses.$index.addToConditions" => 'You do not have permission to update Current Conditions.',
                ]);
            }
        }
    }

    public function sync(Patient $patient, array $diagnoses, string $date): void
    {
        $selected = array_values(array_filter(
            $diagnoses,
            fn ($diagnosis) => is_array($diagnosis)
                && ($diagnosis['addToConditions'] ?? false) === true
                && trim((string) ($diagnosis['name'] ?? '')) !== '',
        ));
        if ($selected === []) {
            return;
        }

        $locked = Patient::query()->whereKey($patient->id)->lockForUpdate()->firstOrFail();
        $background = is_array($locked->medical_background) ? $locked->medical_background : [];
        $conditions = array_values(array_filter($background['currentDiseases'] ?? [], 'is_array'));

        foreach ($selected as $diagnosis) {
            $name = trim((string) $diagnosis['name']);
            $status = in_array($diagnosis['conditionStatus'] ?? null, self::STATUSES, true)
                ? $diagnosis['conditionStatus']
                : 'Active';

            $existing = null;
            foreach ($conditions as $index => $condition) {
                if (mb_strtolower(trim((string) ($condition['name'] ?? ''))) === mb_strtolower($name)) {
                    $existing = $index;
                    break;
                }
            }

            if ($existing !== null) {
                $conditions[$existing]['lastConfirmed'] = $date;
            } elseif (count($conditions) < self::MAX_CONDITIONS) {
                $conditions[] = [
                    'name' => $name,
                    'status' => $status,
                    'firstRecorded' => $date,
                    'lastConfirmed' => $date,
                    'source' => 'Consultation',
                ];
            }
        }

        $background['currentDiseases'] = $conditions;
        $locked->update(['medical_background' => $background]);
    }
}
