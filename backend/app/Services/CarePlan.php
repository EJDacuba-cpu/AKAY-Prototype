<?php

namespace App\Services;

/**
 * The per-diagnosis care-plan choice (health_records.diagnoses[].carePlan).
 * See docs/superpowers/specs/2026-09-30-care-plan-next-steps-design.md.
 */
final class CarePlan
{
    /** Legacy: older records hold it; a new save leaves the next action empty instead. */
    public const NONE = 'none';

    /** Legacy: BHC-owned condition monitoring, retired by the clinical boundary. */
    public const MONITOR = 'monitor';

    public const RECHECK = 'recheck';

    public const FOLLOW_UP = 'follow_up';

    public const REFER = 'refer';

    /**
     * Retired "Monitor at BHC + Refer to RHU": older records keep it, a new
     * save picks one of SELECTABLE per health concern.
     */
    public const MONITOR_REFER = 'monitor_refer';

    /** Every value a stored record may hold. */
    public const VALUES = [self::NONE, self::MONITOR, self::RECHECK, self::FOLLOW_UP, self::REFER, self::MONITOR_REFER];

    /** The next actions a new save may choose; a concern may also have none. */
    public const SELECTABLE = [self::RECHECK, self::FOLLOW_UP, self::REFER];

    /**
     * Whether a STORED value is the retired Monitor / Monitor + Refer. For
     * reading old records only (keepsFollowUpWithReferral): a new save cannot
     * choose it, and nothing starts monitoring from a care plan any more.
     */
    public static function monitors(?string $value): bool
    {
        return $value === self::MONITOR || $value === self::MONITOR_REFER;
    }

    public static function refers(?string $value): bool
    {
        return $value === self::REFER || $value === self::MONITOR_REFER;
    }

    /** Whether the BHC itself brings the patient back (Recheck or Follow-up). */
    public static function keepsBhcFollowUp(?string $value): bool
    {
        return $value === self::RECHECK || $value === self::FOLLOW_UP;
    }

    /**
     * Whether a visit that refers still keeps its own next-visit follow-up:
     * a health concern is set to Recheck or Follow-up, or it is
     * a service visit (Maternal / Family Planning / EPI selected) with a
     * follow-up date set - the next dose, appointment or prenatal return.
     * A plain referral with no service hands the follow-up to the RHU.
     */
    public static function keepsFollowUpWithReferral(array $diagnoses, mixed $monitoringData): bool
    {
        foreach ($diagnoses as $diagnosis) {
            // monitors(): stored legacy records keep their follow-up on resync;
            // a new save can no longer choose Monitor.
            if (is_array($diagnosis) && (
                self::keepsBhcFollowUp($diagnosis['carePlan'] ?? null)
                || self::monitors($diagnosis['carePlan'] ?? null)
            )) {
                return true;
            }
        }
        $monitoringData = is_array($monitoringData) ? $monitoringData : [];
        $programs = $monitoringData['selectedPrograms'] ?? [];
        $date = $monitoringData['followUpDate'] ?? $monitoringData['follow_up_date'] ?? null;

        return is_array($programs) && $programs !== [] && filled($date);
    }

    /** "Recheck: A; B" from the concerns set to Recheck, in order; null when none is. */
    public static function recheckReason(array $diagnoses): ?string
    {
        $names = [];
        foreach ($diagnoses as $diagnosis) {
            if (is_array($diagnosis) && ($diagnosis['carePlan'] ?? null) === self::RECHECK) {
                $name = trim((string) ($diagnosis['name'] ?? ''));
                if ($name !== '') {
                    $names[] = $name;
                }
            }
        }

        return $names === [] ? null : 'Recheck: '.implode('; ', $names);
    }

    public static function refersAny(array $diagnoses): bool
    {
        foreach ($diagnoses as $diagnosis) {
            if (is_array($diagnosis) && self::refers($diagnosis['carePlan'] ?? null)) {
                return true;
            }
        }

        return false;
    }
}
