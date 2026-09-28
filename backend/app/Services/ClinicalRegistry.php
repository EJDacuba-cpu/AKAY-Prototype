<?php

namespace App\Services;

/**
 * Reads config('clinical_registry') - the single source of truth for
 * monitored conditions, surveillance diseases, and care pathways. See
 * docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md.
 *
 * Every match here is exact, case- and whitespace-insensitive, against a
 * name or one of its aliases - never fuzzy, substring, or typo-tolerant.
 * Nothing in this class writes anything; it only answers "what does this
 * text match" for callers (CurrentConditionsSync, HealthRecordController,
 * PatientRequest) that decide what to do with the answer.
 */
class ClinicalRegistry
{
    /** Case/whitespace-insensitive key for comparing a name or alias. */
    public static function normalizeNameKey(?string $name): string
    {
        return preg_replace('/\s+/', ' ', trim(mb_strtolower((string) $name)));
    }

    public function monitoredConditions(): array
    {
        return config('clinical_registry.monitored_conditions', []);
    }

    public function surveillanceDiseases(): array
    {
        return config('clinical_registry.surveillance_diseases', []);
    }

    public function carePathways(): array
    {
        return config('clinical_registry.care_pathways', []);
    }

    /** The whole registry, as served by GET /api/clinical-registry. */
    public function all(): array
    {
        return [
            'monitored_conditions' => $this->monitoredConditions(),
            'surveillance_diseases' => $this->surveillanceDiseases(),
            'care_pathways' => $this->carePathways(),
        ];
    }

    /**
     * The monitored condition $text names or is an alias of, or null.
     * Returns ['key' => 'hypertension', 'name' => 'Hypertension', 'pathway' => 'ncd'].
     */
    public function matchCondition(?string $text): ?array
    {
        $key = self::normalizeNameKey($text);
        if ($key === '') {
            return null;
        }
        foreach ($this->monitoredConditions() as $conditionKey => $entry) {
            if ($this->nameOrAliasMatches($entry, $key)) {
                return [
                    'key' => $conditionKey,
                    'name' => $entry['name'],
                    'pathway' => $entry['pathway'] ?? null,
                ];
            }
        }
        return null;
    }

    /**
     * The surveillance disease $text names or is an alias of, or null.
     * Returns ['key' => 'hfmd', 'name' => 'Hand, Foot and Mouth Disease'].
     */
    public function matchSurveillance(?string $text): ?array
    {
        $key = self::normalizeNameKey($text);
        if ($key === '') {
            return null;
        }
        foreach ($this->surveillanceDiseases() as $diseaseKey => $entry) {
            if ($this->nameOrAliasMatches($entry, $key)) {
                return ['key' => $diseaseKey, 'name' => $entry['name']];
            }
        }
        return null;
    }

    /** The Care Pathway key a monitored condition key belongs to, or null. */
    public function pathwayFor(?string $conditionKey): ?string
    {
        return $this->monitoredConditions()[$conditionKey]['pathway'] ?? null;
    }

    public function isValidConditionKey(?string $conditionKey): bool
    {
        return $conditionKey !== null && array_key_exists($conditionKey, $this->monitoredConditions());
    }

    public function isValidSurveillanceKey(?string $key): bool
    {
        return $key !== null && array_key_exists($key, $this->surveillanceDiseases());
    }

    public function isValidPathwayKey(?string $key): bool
    {
        return $key !== null && array_key_exists($key, $this->carePathways());
    }

    public function pathwayCategory(string $pathwayKey): ?string
    {
        return $this->carePathways()[$pathwayKey]['category'] ?? null;
    }

    public function pathwayUsesDedicatedForm(string $pathwayKey): bool
    {
        return (bool) ($this->carePathways()[$pathwayKey]['uses_dedicated_form'] ?? false);
    }

    /** @return array<int, string> */
    public function pathwayFieldSetKeys(string $pathwayKey): array
    {
        return array_keys($this->carePathways()[$pathwayKey]['field_sets'] ?? []);
    }

    public function pathwayHasFieldSet(string $pathwayKey, string $fieldSetKey): bool
    {
        return in_array($fieldSetKey, $this->pathwayFieldSetKeys($pathwayKey), true);
    }

    /** @return array<int, string> */
    public function pathwayFieldSetFieldKeys(string $pathwayKey, string $fieldSetKey): array
    {
        return array_keys($this->carePathways()[$pathwayKey]['field_sets'][$fieldSetKey]['fields'] ?? []);
    }

    public function pathwayFieldSetFieldConfig(string $pathwayKey, string $fieldSetKey, string $fieldKey): ?array
    {
        return $this->carePathways()[$pathwayKey]['field_sets'][$fieldSetKey]['fields'][$fieldKey] ?? null;
    }

    /**
     * $entries (a consultation's diagnoses, or a patient's Current
     * Conditions) with conditionKey resolved server-side from each entry's
     * name, and the name renormalized to the registry's official spelling
     * when matched (e.g. "PTB" -> "Tuberculosis"). Any client-sent
     * conditionKey is discarded and recomputed here - never trusted, so a
     * tampered request can't mislabel a condition or force a sync.
     */
    public function resolveConditionEntries(array $entries): array
    {
        return array_map(function ($entry) {
            if (! is_array($entry) || trim((string) ($entry['name'] ?? '')) === '') {
                return $entry;
            }
            $match = $this->matchCondition($entry['name']);
            $entry['conditionKey'] = $match['key'] ?? null;
            if ($match !== null) {
                $entry['name'] = $match['name'];
            }
            return $entry;
        }, $entries);
    }

    private function nameOrAliasMatches(array $entry, string $normalizedKey): bool
    {
        if (self::normalizeNameKey($entry['name'] ?? '') === $normalizedKey) {
            return true;
        }
        foreach ($entry['aliases'] ?? [] as $alias) {
            if (self::normalizeNameKey($alias) === $normalizedKey) {
                return true;
            }
        }
        return false;
    }
}
