<?php

namespace App\Services;

/**
 * Reporting-only diagnosis entries (health_records.diagnoses[] in a
 * bhc_general_v2 consultation): {id, name, reportIn[]}. reportIn is the source
 * of truth; reportAs and includeInSurveillance are written as compatibility
 * mirrors so existing readers keep working. Historical entries carry only
 * reportAs and includeInSurveillance, so this normalizer reads both shapes.
 * See docs/superpowers/specs/2026-10-10-bhc-general-consultation-simplification-design.md (B2).
 */
final class ReportingEntries
{
    /** Every place an entry may be reported, in canonical order. */
    public const DESTINATIONS = ['morbidity', 'notifiable', 'surveillance'];

    /**
     * The destinations an entry is reported in, as a list in DESTINATIONS
     * order. Uses reportIn when it is an array (known values only, no
     * duplicates); otherwise reads the legacy reportAs / includeInSurveillance.
     */
    public static function destinations(mixed $entry): array
    {
        if (! is_array($entry)) {
            return [];
        }

        if (is_array($entry['reportIn'] ?? null)) {
            $chosen = $entry['reportIn'];
        } else {
            $chosen = [];
            if (in_array($entry['reportAs'] ?? null, ['morbidity', 'notifiable'], true)) {
                $chosen[] = $entry['reportAs'];
            }
            if (($entry['includeInSurveillance'] ?? false) === true) {
                $chosen[] = 'surveillance';
            }
        }

        return array_values(array_filter(
            self::DESTINATIONS,
            fn (string $destination) => in_array($destination, $chosen, true)
        ));
    }

    /**
     * The stored shape of a v2 entry. Only id, name and reportIn are taken from
     * the client; reportAs and includeInSurveillance are derived mirrors
     * (notifiable > morbidity > null) and conditionKey is always null.
     */
    public static function normalizeForSave(array $entry): array
    {
        $reportIn = self::destinations(['reportIn' => $entry['reportIn'] ?? []]);

        return [
            'id' => $entry['id'] ?? null,
            'name' => trim((string) ($entry['name'] ?? '')),
            'reportIn' => $reportIn,
            'reportAs' => in_array('notifiable', $reportIn, true)
                ? 'notifiable'
                : (in_array('morbidity', $reportIn, true) ? 'morbidity' : null),
            'includeInSurveillance' => in_array('surveillance', $reportIn, true),
            'conditionKey' => null,
        ];
    }

    /**
     * The visit-level morbidity status: notifiable if any entry is reported as
     * notifiable, else morbidity if any is reported as morbidity, else
     * not_included (surveillance alone does not include the visit).
     */
    public static function visitStatus(array $entries): string
    {
        $all = array_merge(...array_map(fn ($entry) => self::destinations($entry), array_values($entries)) ?: [[]]);

        return in_array('notifiable', $all, true)
            ? 'notifiable'
            : (in_array('morbidity', $all, true) ? 'morbidity' : 'not_included');
    }
}
