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
