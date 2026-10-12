<?php

namespace App\Services;

use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;

/**
 * Counts-only summary for the Municipal Health Officer dashboard.
 * Never returns patient names or clinical fields.
 */
class AdminDashboardService
{
    public const PERIODS = ['today', 'week', 'month', 'year'];

    public const DEFAULT_PERIOD = 'month';

    public function summary(string $periodKey, ?CarbonImmutable $now = null): array
    {
        $now ??= CarbonImmutable::now();
        $window = $this->window($periodKey, $now);

        return [
            'period' => $this->periodPayload($window),
            'accounts' => $this->accounts(),
            'generated_at' => $now->toIso8601String(),
        ];
    }

    /**
     * @return array{key: string, from: CarbonImmutable, to: CarbonImmutable, previous_from: CarbonImmutable, previous_to: CarbonImmutable}
     */
    public function window(string $periodKey, CarbonImmutable $now): array
    {
        $key = in_array($periodKey, self::PERIODS, true) ? $periodKey : self::DEFAULT_PERIOD;

        return match ($key) {
            'today' => $this->shifted($key, $now->startOfDay(), $now, fn (CarbonImmutable $d) => $d->subDay()),
            'week' => $this->shifted($key, $now->startOfWeek(Carbon::MONDAY), $now, fn (CarbonImmutable $d) => $d->subWeek()),
            'year' => $this->shifted($key, $now->startOfYear(), $now, fn (CarbonImmutable $d) => $d->subYearNoOverflow()),
            default => $this->shifted($key, $now->startOfMonth(), $now, fn (CarbonImmutable $d) => $d->subMonthNoOverflow()),
        };
    }

    private function shifted(string $key, CarbonImmutable $from, CarbonImmutable $to, callable $back): array
    {
        return [
            'key' => $key,
            'from' => $from,
            'to' => $to,
            'previous_from' => $back($from),
            'previous_to' => $back($to),
        ];
    }

    private function periodPayload(array $window): array
    {
        return [
            'key' => $window['key'],
            'from' => $window['from']->toIso8601String(),
            'to' => $window['to']->toIso8601String(),
            'previous_from' => $window['previous_from']->toIso8601String(),
            'previous_to' => $window['previous_to']->toIso8601String(),
        ];
    }

    private function accounts(): array
    {
        return [
            'total' => User::query()->count(),
            'active' => User::query()->where('status', User::STATUS_ACTIVE)->count(),
            'inactive' => User::query()->where('status', User::STATUS_INACTIVE)->count(),
            'bhc' => User::query()->where('role', User::ROLE_BHC)->count(),
            'rhu' => User::query()->where('role', User::ROLE_RHU)->count(),
        ];
    }
}
