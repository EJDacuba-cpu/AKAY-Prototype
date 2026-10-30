<?php

namespace App\Services;

/**
 * The per-diagnosis care-plan choice (health_records.diagnoses[].carePlan).
 * See docs/superpowers/specs/2026-10-09-consultation-care-plan-workflow-revision-design.md
 * (supersedes 2026-09-30-care-plan-next-steps-design.md).
 */
final class CarePlan
{
    /** No Further BHC Action: a selectable next action; older records may also hold it. */
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

    /** The next actions a new save may choose (No Further BHC Action / BHC Follow-up / Refer to RHU). */
    public const SELECTABLE = [self::NONE, self::FOLLOW_UP, self::REFER];

    /**
     * Retired values a browser tab opened before this release may still POST;
     * the controller stores them as follow_up (normalizeTransitionValues).
     */
    public const TRANSITION_ACCEPTED = [self::RECHECK];

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
     * Whether a concern schedules a BHC follow-up: Follow-up (or a stored
     * Recheck), or Refer to RHU with the opt-in bhcFollowUp flag.
     */
    public static function schedulesBhcFollowUp(mixed $diagnosis): bool
    {
        if (! is_array($diagnosis)) {
            return false;
        }
        $carePlan = $diagnosis['carePlan'] ?? null;

        return self::keepsBhcFollowUp($carePlan)
            || (self::refers($carePlan) && ($diagnosis['bhcFollowUp'] ?? null) === true);
    }

    /** Maps the retired recheck value to follow_up; every other key is kept. */
    public static function normalizeTransitionValues(array $diagnoses): array
    {
        return array_map(function ($diagnosis) {
            if (is_array($diagnosis) && ($diagnosis['carePlan'] ?? null) === self::RECHECK) {
                $diagnosis['carePlan'] = self::FOLLOW_UP;
            }

            return $diagnosis;
        }, $diagnoses);
    }

    /**
     * Whether a visit that refers still keeps its own next-visit follow-up:
     * a health concern schedules a BHC follow-up, or it is
     * a service visit (Maternal / Family Planning / EPI selected) with a
     * follow-up date set - the next dose, appointment or prenatal return -
     * or a v2 visit with Schedule BHC Follow-up ticked (monitoring_data.bhcFollowUp).
     * A plain referral with no service hands the follow-up to the RHU.
     */
    public static function keepsFollowUpWithReferral(array $diagnoses, mixed $monitoringData): bool
    {
        foreach ($diagnoses as $diagnosis) {
            // monitors(): stored legacy records keep their follow-up on resync;
            // a new save can no longer choose Monitor.
            if (is_array($diagnosis) && (
                self::schedulesBhcFollowUp($diagnosis)
                || self::monitors($diagnosis['carePlan'] ?? null)
            )) {
                return true;
            }
        }
        $monitoringData = is_array($monitoringData) ? $monitoringData : [];
        // v2 (bhc_general_v2): the visit-level Schedule BHC Follow-up flag the
        // controller stores as a real boolean. The re-sync reads it too, so a
        // v2 visit with both a follow-up and a referral keeps its task.
        if (($monitoringData['bhcFollowUp'] ?? null) === true) {
            return true;
        }
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

    /**
     * How many items one referral would cover: concerns set to Refer to RHU
     * plus distinct monitored conditions referred in the same visit.
     *
     * @param  array<int, mixed>  $monitoringReferralIds
     */
    public static function referralItemCount(array $diagnoses, array $monitoringReferralIds): int
    {
        $concerns = 0;
        foreach ($diagnoses as $diagnosis) {
            if (is_array($diagnosis) && self::refers($diagnosis['carePlan'] ?? null)) {
                $concerns++;
            }
        }

        return $concerns + count(array_unique(array_map('intval', $monitoringReferralIds)));
    }

    /**
     * Selected Prenatal / EPI / FP services explicitly marked Refer to RHU.
     *
     * @param  array<string, mixed>  $carePlan
     * @param  array<int, mixed>  $selectedPrograms
     * @return array<int, string>
     */
    public static function v2ServiceReferrals(array $carePlan, array $selectedPrograms = []): array
    {
        $selected = array_flip(array_values(array_filter($selectedPrograms, 'is_string')));
        $keys = [];
        foreach ($carePlan['service_referrals'] ?? [] as $key) {
            if (is_string($key) && isset(ConsultationPrograms::CLASSIFICATIONS[$key]) && isset($selected[$key])) {
                $keys[$key] = $key;
            }
        }

        return array_values($keys);
    }

    /**
     * v2 shared-referral sources: named concerns, selected services, and
     * referred monitoring. A visit-level Refer with no named source still
     * counts as one item. The retired multiple-issues checkbox is ignored.
     *
     * @param  array<int, mixed>  $diagnoses
     * @param  array<string, mixed>  $carePlan
     * @param  array<int, mixed>  $monitoringReferralIds
     * @param  array<int, mixed>  $selectedPrograms
     */
    public static function v2ReferralSourceCount(
        array $diagnoses,
        array $carePlan,
        array $monitoringReferralIds = [],
        array $selectedPrograms = []
    ): int {
        $shared = filter_var($carePlan['shared_condition_referral'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $cards = 0;
        if ($shared) {
            foreach ($diagnoses as $diagnosis) {
                if (! is_array($diagnosis) || ($diagnosis['clinicalOutcome'] ?? null) !== 'refer_to_rhu') {
                    continue;
                }
                if (trim((string) ($diagnosis['name'] ?? '')) !== '') {
                    $cards++;
                }
            }
        }
        $services = count(self::v2ServiceReferrals($carePlan, $selectedPrograms));
        $cards += count(array_filter($carePlan['continued_concerns'] ?? [], fn ($item) => is_array($item) && ($item['careOutcome'] ?? null) === 'refer_to_rhu'));
        $monitoring = count(array_unique(array_map('intval', $monitoringReferralIds)));
        $refers = filter_var($carePlan['refer_to_rhu'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $legacy = ($cards === 0 && $services === 0 && $refers) ? 1 : 0;

        return $cards + $services + $monitoring + $legacy;
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
