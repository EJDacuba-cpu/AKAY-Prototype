<?php

namespace App\Services;

use App\Models\Patient;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Applies a consultation's diagnoses to the patient's Current Conditions
 * (patients.medical_background.currentDiseases). Two independent paths, per
 * docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md:
 * a diagnosis the server resolved to a registered monitored condition
 * (conditionKey set by ClinicalRegistry::resolveConditionEntries) syncs
 * ALWAYS, regardless of the addToConditions toggle or the saving user's
 * permissions - it is a registry rule attached to the diagnosis, not a
 * manual history edit. A free-text diagnosis (no conditionKey) syncs only
 * when the user ticked "Add to Current Conditions", gated by clinical.history
 * exactly as before.
 *
 * Runs inside the health record's save transaction, so a consultation that
 * fails to save never touches the profile. A condition already on the list
 * is linked rather than added twice - matched by conditionKey when both
 * sides have one, else by name (case/outer-space insensitive), for a
 * pre-registry legacy entry with no key yet. A match only moves its last
 * confirmed date to this visit and (if a key was resolved) stamps the key
 * and renames the entry to the registry's official spelling; its status is
 * otherwise left exactly as the Patient Profile or a prior visit set it - a
 * re-diagnosis is never itself treated as a relapse.
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
     * the profile may not edit them through a consultation either - but that
     * only applies to a free-text diagnosis' manual addToConditions toggle. A
     * registered condition's automatic sync is never blocked here.
     */
    public function assertAllowed(User $user, array $diagnoses): void
    {
        if ($this->canSync($user)) {
            return;
        }
        foreach ($diagnoses as $index => $diagnosis) {
            if (($diagnosis['conditionKey'] ?? null) !== null) {
                continue;
            }
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
                && trim((string) ($diagnosis['name'] ?? '')) !== ''
                && (($diagnosis['conditionKey'] ?? null) !== null || ($diagnosis['addToConditions'] ?? false) === true),
        ));
        if ($selected === []) {
            return;
        }

        $locked = Patient::query()->whereKey($patient->id)->lockForUpdate()->firstOrFail();
        $background = is_array($locked->medical_background) ? $locked->medical_background : [];
        $conditions = array_values(array_filter($background['currentDiseases'] ?? [], 'is_array'));

        foreach ($selected as $diagnosis) {
            $name = trim((string) $diagnosis['name']);
            $conditionKey = $diagnosis['conditionKey'] ?? null;
            $status = in_array($diagnosis['conditionStatus'] ?? null, self::STATUSES, true)
                ? $diagnosis['conditionStatus']
                : 'Active';

            $existing = null;
            foreach ($conditions as $index => $condition) {
                $existingKey = $condition['conditionKey'] ?? null;
                $matches = ($conditionKey !== null && $existingKey !== null)
                    ? $existingKey === $conditionKey
                    : mb_strtolower(trim((string) ($condition['name'] ?? ''))) === mb_strtolower($name);
                if ($matches) {
                    $existing = $index;
                    break;
                }
            }

            if ($existing !== null) {
                $conditions[$existing]['lastConfirmed'] = $date;
                if ($conditionKey !== null) {
                    $conditions[$existing]['conditionKey'] = $conditionKey;
                    $conditions[$existing]['name'] = $name;
                }
            } elseif (count($conditions) < self::MAX_CONDITIONS) {
                $conditions[] = [
                    'name' => $name,
                    'status' => $status,
                    'firstRecorded' => $date,
                    'lastConfirmed' => $date,
                    'source' => 'Consultation',
                    'conditionKey' => $conditionKey,
                ];
            }
        }

        $background['currentDiseases'] = $conditions;
        $locked->update(['medical_background' => $background]);
    }
}
