<?php

namespace App\Services;

use App\Exceptions\PatientBackgroundConflictException;
use App\Models\Patient;
use App\Models\User;

/**
 * The patient's longitudinal background (patients.medical_background) as three
 * sections, and the one way a consultation changes it - per
 * docs/superpowers/specs/2026-10-03-patient-background-tab-design.md.
 *
 * Each section is a slice of the JSON object. A consultation stages edits to
 * whole sections; on finalize apply() merges only those slices onto the locked
 * patient row, so the sections it did not touch keep whatever they hold now.
 * revisions.{section} is the optimistic-concurrency token: an edited section
 * whose revision moved since the clinician opened it is a conflict, an
 * untouched one never is.
 */
class PatientBackground
{
    /** Section => the top-level medical_background keys it owns. */
    public const SECTIONS = [
        'medical' => ['currentDiseases', 'allergies', 'hospitalizations', 'surgeries'],
        'family' => ['familyHistory'],
        'social' => ['personalSocial'],
    ];

    private const NESTED_FIELDS = [
        'familyHistory' => ['similarIllness', 'chronicIllness', 'hereditaryIllness'],
        'personalSocial' => ['diet', 'smoking', 'alcohol', 'notes'],
    ];

    private const DISEASE_FIELDS = ['name', 'status', 'firstRecorded', 'lastConfirmed', 'source', 'conditionKey'];

    public function __construct(private readonly ClinicalRegistry $clinicalRegistry) {}

    public static function canAccess(?User $user): bool
    {
        return $user !== null && ($user->isAdmin() || ActionPermissions::allows($user, 'clinical.history'));
    }

    /**
     * Validation for a staged update under $prefix. The section field rules are
     * the ones the patient API used before background editing moved here.
     */
    public static function rules(string $prefix, string $basesKey): array
    {
        $sections = "{$prefix}.sections";
        $medical = "{$sections}.medical";

        return [
            $prefix => ['nullable', 'array:sections,'.$basesKey],
            $sections => ['required_with:'.$prefix, 'array:medical,family,social'],
            "{$prefix}.{$basesKey}" => ['required_with:'.$prefix, 'array:medical,family,social'],
            "{$prefix}.{$basesKey}.*" => ['integer', 'min:0'],
            "{$prefix}.{$basesKey}.medical" => ['required_with:'.$medical],
            "{$prefix}.{$basesKey}.family" => ['required_with:'.$sections.'.family'],
            "{$prefix}.{$basesKey}.social" => ['required_with:'.$sections.'.social'],
            $medical => ['nullable', 'array'],
            "{$medical}.currentDiseases" => ['nullable', 'array', 'max:50'],
            "{$medical}.currentDiseases.*.name" => ['required', 'string', 'max:150'],
            "{$medical}.currentDiseases.*.status" => ['nullable', 'string', 'max:50'],
            "{$medical}.currentDiseases.*.firstRecorded" => ['nullable', 'date'],
            "{$medical}.currentDiseases.*.lastConfirmed" => ['nullable', 'date'],
            "{$medical}.currentDiseases.*.source" => ['nullable', 'string', 'max:100'],
            // Always re-resolved from the name by ClinicalRegistry on apply.
            "{$medical}.currentDiseases.*.conditionKey" => ['nullable', 'string', 'max:64'],
            "{$medical}.allergies" => ['nullable', 'string', 'max:1000'],
            "{$medical}.hospitalizations" => ['nullable', 'string', 'max:1000'],
            "{$medical}.surgeries" => ['nullable', 'string', 'max:1000'],
            "{$sections}.family" => ['nullable', 'array'],
            "{$sections}.family.familyHistory" => ['nullable', 'array'],
            "{$sections}.family.familyHistory.similarIllness" => ['nullable', 'string', 'max:1000'],
            "{$sections}.family.familyHistory.chronicIllness" => ['nullable', 'string', 'max:1000'],
            "{$sections}.family.familyHistory.hereditaryIllness" => ['nullable', 'string', 'max:1000'],
            "{$sections}.social" => ['nullable', 'array'],
            "{$sections}.social.personalSocial" => ['nullable', 'array'],
            "{$sections}.social.personalSocial.diet" => ['nullable', 'string', 'max:255'],
            "{$sections}.social.personalSocial.smoking" => ['nullable', 'string', 'max:255'],
            "{$sections}.social.personalSocial.alcohol" => ['nullable', 'string', 'max:255'],
            "{$sections}.social.personalSocial.notes" => ['nullable', 'string', 'max:1000'],
        ];
    }

    public static function revision(array $background, string $section): int
    {
        return (int) ($background['revisions'][$section] ?? 0);
    }

    /** The keys one section owns, each present (null when never recorded). */
    public static function slice(array $background, string $section): array
    {
        $slice = [];
        foreach (self::SECTIONS[$section] as $key) {
            $slice[$key] = $background[$key] ?? null;
        }

        return $slice;
    }

    public static function entry(
        string $section,
        string $source,
        array $before,
        array $after,
        int $revision,
        ?User $user
    ): array {
        return [
            'section' => $section,
            'source' => $source,
            'before' => $before,
            'after' => $after,
            'revision' => $revision,
            'changedBy' => $user?->id,
            'changedAt' => now()->toISOString(),
        ];
    }

    /**
     * Applies a staged update to the patient, inside the caller's transaction.
     *
     * @param  array{sections?: array, base_revisions?: array}  $update
     * @return array<int, array> one change entry per section that actually changed
     *
     * @throws PatientBackgroundConflictException when an edited section is stale
     */
    public function apply(Patient $patient, array $update, User $user, string $date): array
    {
        $sections = array_intersect_key(
            array_filter($update['sections'] ?? [], 'is_array'),
            self::SECTIONS
        );
        if ($sections === []) {
            return [];
        }

        $locked = Patient::query()->whereKey($patient->id)->lockForUpdate()->firstOrFail();
        $background = is_array($locked->medical_background) ? $locked->medical_background : [];
        $bases = $update['base_revisions'] ?? [];

        $conflicts = [];
        foreach (array_keys($sections) as $section) {
            $current = self::revision($background, $section);
            if (! array_key_exists($section, $bases) || (int) $bases[$section] !== $current) {
                $conflicts[] = [
                    'section' => $section,
                    'current' => self::slice($background, $section),
                    'revision' => $current,
                    'updatedAt' => $background['updatedAt'][$section] ?? null,
                ];
            }
        }
        if ($conflicts !== []) {
            throw new PatientBackgroundConflictException($conflicts);
        }

        $changes = [];
        foreach ($sections as $section => $edited) {
            $before = self::slice($background, $section);
            $after = $this->normalize($section, $edited, $before);
            // Loose: "" and null both mean "not recorded".
            if (self::filled($after) == self::filled($before)) {
                continue;
            }

            $revision = self::revision($background, $section) + 1;
            $background = [...$background, ...$after];
            $background['revisions'][$section] = $revision;
            $background['updatedAt'][$section] = $date;
            $changes[] = self::entry($section, 'consultation', $before, $after, $revision, $user);
        }

        if ($changes !== []) {
            $locked->update(['medical_background' => $background]);
        }

        return $changes;
    }

    /**
     * Changes the documented status of conditions the consultation followed,
     * when the clinician intentionally chose a new one in Care Plan & Next
     * Steps. Touches only the matching Current Conditions entry's status (and
     * the date it was confirmed) on the locked patient row, so it never
     * conflicts with a Review / Update edit and a condition with no entry
     * there is left alone. Runs inside the caller's transaction.
     *
     * @param  \Illuminate\Support\Collection<int, \App\Models\ConditionMonitoring>  $continued  from lockContinued()
     * @param  array<int, array{monitoring_id: int|string, status: string}>  $updates
     * @return array<int, array> the change entry (one at most), as apply() returns
     */
    public function applyConditionStatuses(Patient $patient, \Illuminate\Support\Collection $continued, array $updates, User $user, string $date): array
    {
        if ($updates === []) {
            return [];
        }

        $locked = Patient::query()->whereKey($patient->id)->lockForUpdate()->firstOrFail();
        $background = is_array($locked->medical_background) ? $locked->medical_background : [];
        $before = self::slice($background, 'medical');
        $diseases = array_values(array_filter(is_array($before['currentDiseases']) ? $before['currentDiseases'] : [], 'is_array'));
        $changed = false;

        foreach ($updates as $update) {
            $monitoring = $continued->get((int) $update['monitoring_id']);
            if ($monitoring === null) {
                continue;
            }
            foreach ($diseases as $index => $disease) {
                $key = $disease['conditionKey'] ?? null;
                $matches = ($monitoring->condition_key !== null && $key === $monitoring->condition_key)
                    || $this->clinicalRegistry->conditionIdentity($key, (string) ($disease['name'] ?? '')) === $monitoring->condition_identity;
                if (! $matches) {
                    continue;
                }
                if (($disease['status'] ?? null) !== $update['status']) {
                    $diseases[$index]['status'] = $update['status'];
                    $diseases[$index]['lastConfirmed'] = $date;
                    $changed = true;
                }
                break;
            }
        }

        if (! $changed) {
            return [];
        }

        $after = [...$before, 'currentDiseases' => $diseases];
        $revision = self::revision($background, 'medical') + 1;
        $background = [...$background, ...$after];
        $background['revisions']['medical'] = $revision;
        $background['updatedAt']['medical'] = $date;
        $locked->update(['medical_background' => $background]);

        return [self::entry('medical', 'consultation', $before, $after, $revision, $user)];
    }

    /** A slice with every nested field present, so a never-recorded field equals an empty one. */
    private static function filled(array $slice): array
    {
        foreach (self::NESTED_FIELDS as $key => $fields) {
            if (array_key_exists($key, $slice)) {
                $nested = is_array($slice[$key]) ? $slice[$key] : [];
                $slice[$key] = array_merge(array_fill_keys($fields, null), $nested);
            }
        }

        return $slice;
    }

    /**
     * The edited slice reduced to the keys its section owns. A key the client
     * left out keeps its current value; nested objects keep only known fields.
     */
    private function normalize(string $section, array $edited, array $before): array
    {
        $after = $before;
        foreach (self::SECTIONS[$section] as $key) {
            if (! array_key_exists($key, $edited)) {
                continue;
            }
            $value = $edited[$key];

            if ($key === 'currentDiseases') {
                $diseases = array_map(
                    fn ($disease) => array_intersect_key($disease, array_flip(self::DISEASE_FIELDS)),
                    array_values(array_filter($value ?? [], 'is_array'))
                );
                $after[$key] = $this->clinicalRegistry->resolveConditionEntries($diseases);
            } elseif (isset(self::NESTED_FIELDS[$key])) {
                $nested = [];
                foreach (self::NESTED_FIELDS[$key] as $field) {
                    $nested[$field] = is_array($value) ? ($value[$field] ?? null) : null;
                }
                $after[$key] = $nested;
            } else {
                $after[$key] = $value;
            }
        }

        return $after;
    }
}
