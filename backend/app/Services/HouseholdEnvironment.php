<?php

namespace App\Services;

use App\Models\Patient;
use Illuminate\Support\Collection;

/**
 * The household environment suggestion for the ITR Patient History social
 * section (decision D8 in docs/superpowers/specs/2026-10-16-itr-patient-history-design.md).
 *
 * Linked patients share a permanent household ID within their BHC or RHU. Legacy
 * unlinked patients retain the serial-based lookup. The caller supplies only
 * patients authorized in the current facility.
 */
class HouseholdEnvironment
{
    /**
     * The environment most recently recorded for a household member other than
     * $patient, or null when nobody in the household has one. $others are
     * candidates already scoped to the user's facility; household membership
     * and the patient's own exclusion are applied here as well.
     *
     * @param  Collection<int, Patient>  $others
     * @return array{environment: array, patientId: int, patientName: string, date: ?string}|null
     */
    public static function latestFor(Patient $patient, Collection $others): ?array
    {
        $serial = trim((string) $patient->family_serial_number);
        if ($serial === '' && ! $patient->household_id) {
            return null;
        }

        $best = $others
            ->filter(fn (Patient $other) => $other->id !== $patient->id
                && ($patient->household_id
                    ? $other->household_id === $patient->household_id
                        && $other->barangay_health_center_id === $patient->barangay_health_center_id
                        && $other->rural_health_unit_id === $patient->rural_health_unit_id
                    : ! $other->household_id && trim((string) $other->family_serial_number) === $serial)
                && self::environmentOf($other) !== null)
            // Newest social update first; an undated record sorts last, and
            // the most recent patient id breaks any remaining tie.
            ->sort(fn (Patient $a, Patient $b) => [self::dateOf($b), $b->id] <=> [self::dateOf($a), $a->id])
            ->first();

        if (! $best) {
            return null;
        }

        return [
            'environment' => self::environmentOf($best),
            'patientId' => $best->id,
            'patientName' => $best->full_name,
            'date' => self::dateOf($best) ?: null,
        ];
    }

    private static function environmentOf(Patient $patient): ?array
    {
        $environment = $patient->medical_background['personalSocial']['environment'] ?? null;

        return is_array($environment) && $environment !== [] ? $environment : null;
    }

    private static function dateOf(Patient $patient): string
    {
        $date = $patient->medical_background['updatedAt']['social'] ?? '';

        return is_string($date) ? $date : '';
    }
}
