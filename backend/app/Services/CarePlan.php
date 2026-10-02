<?php

namespace App\Services;

/**
 * The per-diagnosis care-plan choice (health_records.diagnoses[].carePlan).
 * See docs/superpowers/specs/2026-09-30-care-plan-next-steps-design.md.
 */
final class CarePlan
{
    public const NONE = 'none';

    public const MONITOR = 'monitor';

    public const REFER = 'refer';

    public const MONITOR_REFER = 'monitor_refer';

    public const VALUES = [self::NONE, self::MONITOR, self::REFER, self::MONITOR_REFER];

    public static function monitors(?string $value): bool
    {
        return $value === self::MONITOR || $value === self::MONITOR_REFER;
    }

    public static function refers(?string $value): bool
    {
        return $value === self::REFER || $value === self::MONITOR_REFER;
    }

    public static function monitorsAny(array $diagnoses): bool
    {
        foreach ($diagnoses as $diagnosis) {
            if (is_array($diagnosis) && self::monitors($diagnosis['carePlan'] ?? null)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Whether a visit that refers still keeps its own next-visit follow-up:
     * it monitors a condition at the BHC ("Monitor at BHC + Refer"), or it is
     * a service visit (Maternal / Family Planning / EPI selected) with a
     * follow-up date set - the next dose, appointment or prenatal return.
     * A plain referral with no service hands the follow-up to the RHU.
     */
    public static function keepsFollowUpWithReferral(array $diagnoses, mixed $monitoringData): bool
    {
        if (self::monitorsAny($diagnoses)) {
            return true;
        }
        $monitoringData = is_array($monitoringData) ? $monitoringData : [];
        $programs = $monitoringData['selectedPrograms'] ?? [];
        $date = $monitoringData['followUpDate'] ?? $monitoringData['follow_up_date'] ?? null;

        return is_array($programs) && $programs !== [] && filled($date);
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
