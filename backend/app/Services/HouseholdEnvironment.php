<?php

namespace App\Services;

use App\Models\Patient;
use Illuminate\Support\Collection;

/**
 * The household environment suggestion for the ITR Patient History social
 * section (decision D8 in docs/superpowers/specs/2026-10-16-itr-patient-history-design.md).
 *
 * Households have no table: "same household" is another patient with the same
 * non-empty family_serial_number. The caller passes only patients the user may
 * see, so nothing outside their facility can leak through here.
 */
class HouseholdEnvironment
{
    /**
     * The environment most recently recorded for a household member other than
     * $patient, or null when nobody in the household has one. $others are
     * candidates already scoped to the user's facility; the same-serial filter
     * and the patient's own exclusion are applied here as well.
     *
     * @param  Collection<int, Patient>  $others
     * @return array{environment: array, patientId: int, patientName: string, date: ?string}|null
     */
    public static function latestFor(Patient $patient, Collection $others): ?array
    {
        $serial = trim((string) $patient->family_serial_number);
        if ($serial === '') {
            return null;
        }

        $best = $others
            ->filter(fn (Patient $other) => $other->id !== $patient->id
                && trim((string) $other->family_serial_number) === $serial
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
