<?php

namespace App\Services;

/**
 * Reads config('clinical_registry') - the single source of truth for
 * monitored conditions. See
 * docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md.
 * (Surveillance is no longer registry-driven: each diagnosis carries its own
 * includeInSurveillance flag - see the care-plan-next-steps spec.)
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

    /** The whole registry, as served by GET /api/clinical-registry. */
    public function all(): array
    {
        return [
            'monitored_conditions' => $this->monitoredConditions(),
        ];
    }

    /**
     * The monitored condition $text names or is an alias of, or null.
     * Returns ['key' => 'hypertension', 'name' => 'Hypertension'].
     */
    public function matchCondition(?string $text): ?array
    {
        $key = self::normalizeNameKey($text);
        if ($key === '') {
            return null;
        }
        foreach ($this->monitoredConditions() as $conditionKey => $entry) {
            if ($this->nameOrAliasMatches($entry, $key)) {
                return ['key' => $conditionKey, 'name' => $entry['name']];
            }
        }
        return null;
    }

    public function isValidConditionKey(?string $conditionKey): bool
    {
        return $conditionKey !== null && array_key_exists($conditionKey, $this->monitoredConditions());
    }

    /** What "same condition" means for monitoring: the registry key, else the normalized name. */
    public function conditionIdentity(?string $conditionKey, string $name): string
    {
        return $conditionKey !== null && $this->isValidConditionKey($conditionKey)
            ? $conditionKey
            : 'name:'.self::normalizeNameKey($name);
    }

    /** The Monitoring Details form key a monitored condition needs, or null. */
    public function monitoringDetailsFor(?string $conditionKey): ?string
    {
        return $this->monitoredConditions()[$conditionKey]['monitoring_details'] ?? null;
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
