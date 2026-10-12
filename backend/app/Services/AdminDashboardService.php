<?php

namespace App\Services;

use App\Models\AccountInvite;
use App\Models\BarangayHealthCenter;
use App\Models\FacilityAssignment;
use App\Models\FollowUpTask;
use App\Models\Medicine;
use App\Models\PasswordResetRequest;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

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

        // Each per-BHC map is built once and shared by the totals and the barangay rows.
        $referralsByBhc = $this->referralCountsByBhc($window);
        $lowStockByBhc = $this->lowStockByBhc();
        $withoutStaff = $this->facilitiesWithoutStaff($window);

        return [
            'period' => $this->periodPayload($window),
            'accounts' => $this->accounts(),
            'referrals' => $this->referrals($window, $referralsByBhc),
            'follow_ups' => $this->followUps($window),
            'patients' => $this->patients($window),
            'medicines' => $this->medicines($lowStockByBhc),
            'attention' => $this->attention($window, $withoutStaff),
            'barangays' => $this->barangays($window, $referralsByBhc, $lowStockByBhc, $withoutStaff),
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

    /**
     * @param  array<int, array{referrals: int, completed: int, no_show: int, pending: int, priority_pending: int}>  $byBhc
     */
    private function referrals(array $window, array $byBhc): array
    {
        $sum = fn (string $key): int => array_sum(array_column($byBhc, $key));

        return [
            'total' => $sum('referrals'),
            'previous_total' => $this->referralDateQuery($window['previous_from'], $window['previous_to'])->count(),
            'completed' => $sum('completed'),
            'no_show' => $sum('no_show'),
            'pending' => $sum('pending'),
            'priority_pending' => $sum('priority_pending'),
        ];
    }

    /**
     * Per-BHC referral counts, keyed by barangay_health_center_id.
     * referrals, completed and no_show cover the current window; pending and
     * priority_pending are "now" counts and ignore the window.
     * Statuses are normalized in PHP so legacy values land in their canonical bucket.
     *
     * @return array<int, array{referrals: int, completed: int, no_show: int, pending: int, priority_pending: int}>
     */
    private function referralCountsByBhc(array $window): array
    {
        $counts = [];
        $bucket = function (int $bhcId) use (&$counts): void {
            $counts[$bhcId] ??= ['referrals' => 0, 'completed' => 0, 'no_show' => 0, 'pending' => 0, 'priority_pending' => 0];
        };

        foreach ($this->referralGroups($this->referralDateQuery($window['from'], $window['to'])) as $row) {
            $bucket($row->barangay_health_center_id);
            $status = Referral::normalizeWorkflowStatus($row->status);
            $counts[$row->barangay_health_center_id]['referrals'] += $row->total;

            if ($status === Referral::STATUS_COMPLETED) {
                $counts[$row->barangay_health_center_id]['completed'] += $row->total;
            } elseif ($status === Referral::STATUS_NO_SHOW) {
                $counts[$row->barangay_health_center_id]['no_show'] += $row->total;
            }
        }

        foreach ($this->referralGroups(Referral::query()) as $row) {
            if (Referral::normalizeWorkflowStatus($row->status) !== Referral::STATUS_PENDING) {
                continue;
            }

            $bucket($row->barangay_health_center_id);
            $counts[$row->barangay_health_center_id]['pending'] += $row->total;

            if ($row->urgency_level === Referral::ATTENTION_PRIORITY) {
                $counts[$row->barangay_health_center_id]['priority_pending'] += $row->total;
            }
        }

        return $counts;
    }

    /**
     * Referral date is referral_datetime, falling back to created_at when it is null.
     */
    private function referralDateQuery(CarbonImmutable $from, CarbonImmutable $to): Builder
    {
        return Referral::query()->whereRaw('COALESCE(referral_datetime, created_at) between ? and ?', [$from, $to]);
    }

    /**
     * @return Collection<int, object{barangay_health_center_id: int, status: string, urgency_level: string, total: int}>
     */
    private function referralGroups(Builder $query): Collection
    {
        return $query
            ->selectRaw('barangay_health_center_id, status, urgency_level, count(*) as total')
            ->groupBy('barangay_health_center_id', 'status', 'urgency_level')
            ->toBase()
            ->get()
            ->each(fn (object $row) => $row->total = (int) $row->total);
    }

    private function followUps(array $window): array
    {
        return [
            'overdue' => $this->overdueFollowUpQuery($window)->count(),
            'no_show' => FollowUpTask::query()
                ->where('state', FollowUpTask::STATE_NO_SHOW)
                ->whereBetween('no_show_at', [$window['from'], $window['to']])
                ->count(),
        ];
    }

    /**
     * Overdue follow-ups per BHC, keyed by barangay_health_center_id.
     *
     * @return array<int, int>
     */
    private function overdueFollowUpsByBhc(array $window): array
    {
        return $this->overdueFollowUpQuery($window)
            ->whereNotNull('barangay_health_center_id')
            ->selectRaw('barangay_health_center_id, count(*) as total')
            ->groupBy('barangay_health_center_id')
            ->toBase()
            ->pluck('total', 'barangay_health_center_id')
            ->map(fn ($total) => (int) $total)
            ->all();
    }

    private function overdueFollowUpQuery(array $window): Builder
    {
        return FollowUpTask::query()
            ->where('state', FollowUpTask::STATE_PENDING)
            // Every window ends at "now", so its end date is today.
            ->where('due_date', '<', $window['to']->toDateString());
    }

    private function patients(array $window): array
    {
        return [
            'total' => Patient::query()->count(),
            'new' => Patient::query()->whereBetween('created_at', [$window['from'], $window['to']])->count(),
        ];
    }

    /**
     * @param  array<int, int>  $bhcLowStock
     */
    private function medicines(array $bhcLowStock): array
    {
        return [
            'rhu_low_stock' => $this->lowStockQuery()->whereNotNull('rural_health_unit_id')->count(),
            'bhc_low_stock' => array_sum($bhcLowStock),
            'bhc_barangays_affected' => count($bhcLowStock),
        ];
    }

    /**
     * Low-stock medicine counts per BHC, keyed by barangay_health_center_id.
     *
     * @return array<int, int>
     */
    private function lowStockByBhc(): array
    {
        return $this->lowStockQuery()
            ->whereNotNull('barangay_health_center_id')
            ->selectRaw('barangay_health_center_id, count(*) as total')
            ->groupBy('barangay_health_center_id')
            ->toBase()
            ->pluck('total', 'barangay_health_center_id')
            ->map(fn ($total) => (int) $total)
            ->all();
    }

    private function lowStockQuery(): Builder
    {
        return Medicine::query()
            ->where('is_active', true)
            ->whereIn('availability_status', ['Low Stock', 'Unavailable']);
    }

    /**
     * @param  list<array{type: string, id: int, name: string}>  $withoutStaff
     */
    private function attention(array $window, array $withoutStaff): array
    {
        // Same sequence as the Password & Invites summary, so both screens show the same numbers.
        AccessRequestStatus::expireStaleInvites();
        AccessRequestStatus::expireStaleResetRequests();

        $invites = AccountInvite::query();
        AccessRequestStatus::applyToInvites($invites, AccessRequestStatus::PENDING);

        $resets = PasswordResetRequest::query();
        AccessRequestStatus::applyToResetRequests($resets, AccessRequestStatus::PENDING);

        return [
            'reset_requests' => $resets->count(),
            'invites' => $invites->count(),
            'stale_priority_referrals' => $this->stalePriorityReferrals($window),
            'facilities_without_staff' => $withoutStaff,
        ];
    }

    /**
     * Pending Priority referrals whose referral date is more than two days old.
     * Exactly two days old is not stale yet.
     */
    private function stalePriorityReferrals(array $window): int
    {
        $query = Referral::query()
            ->where('urgency_level', Referral::ATTENTION_PRIORITY)
            // Every window ends at "now", so its end is the reference time.
            ->whereRaw('COALESCE(referral_datetime, created_at) < ?', [$window['to']->subDays(2)]);

        return $this->referralGroups($query)
            ->filter(fn (object $row) => Referral::normalizeWorkflowStatus($row->status) === Referral::STATUS_PENDING)
            ->sum('total');
    }

    /**
     * Active facilities nobody currently staffs: BHCs first, then RHUs, each by name.
     *
     * @return list<array{type: string, id: int, name: string}>
     */
    private function facilitiesWithoutStaff(array $window): array
    {
        // Every window ends at "now", so its end date is today.
        $staffedBhcs = array_flip($this->staffedBhcIds($window['to']->toDateString()));
        $staffedRhus = array_flip(
            User::query()
                ->where('status', User::STATUS_ACTIVE)
                ->where('role', User::ROLE_RHU)
                ->whereNotNull('rural_health_unit_id')
                ->distinct()
                ->pluck('rural_health_unit_id')
                ->all()
        );

        $bhcs = $this->activeBhcs()
            ->reject(fn (BarangayHealthCenter $bhc) => isset($staffedBhcs[$bhc->id]))
            ->map(fn (BarangayHealthCenter $bhc) => ['type' => 'bhc', 'id' => $bhc->id, 'name' => $bhc->name]);

        $rhus = RuralHealthUnit::query()
            ->where('status', 'active')
            ->orderBy('name')->orderBy('id')
            ->get(['id', 'name'])
            ->reject(fn (RuralHealthUnit $rhu) => isset($staffedRhus[$rhu->id]))
            ->map(fn (RuralHealthUnit $rhu) => ['type' => 'rhu', 'id' => $rhu->id, 'name' => $rhu->name]);

        return $bhcs->concat($rhus)->values()->all();
    }

    /**
     * BHC ids with an active home user or a current assignment held by an active user.
     * The assignment predicate matches WorkingFacilityService::available().
     *
     * @return list<int>
     */
    private function staffedBhcIds(string $today): array
    {
        $home = User::query()
            ->where('status', User::STATUS_ACTIVE)
            ->whereNotNull('barangay_health_center_id')
            ->distinct()
            ->pluck('barangay_health_center_id');

        $assigned = FacilityAssignment::query()
            ->whereNull('revoked_at')
            ->whereNotNull('barangay_health_center_id')
            ->whereNotNull('starts_on')
            ->whereDate('starts_on', '<=', $today)
            ->where(fn (Builder $q) => $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', $today))
            ->whereHas('user', fn (Builder $user) => $user->where('status', User::STATUS_ACTIVE))
            ->distinct()
            ->pluck('barangay_health_center_id');

        return $home->merge($assigned)->unique()->values()->all();
    }

    /**
     * @return Collection<int, BarangayHealthCenter>
     */
    private function activeBhcs(): Collection
    {
        return BarangayHealthCenter::query()
            ->where('status', 'active')
            ->orderBy('name')->orderBy('id')
            ->get(['id', 'name', 'barangay']);
    }

    /**
     * One row per active BHC. referrals and no_show follow the period; the rest are "now" values.
     *
     * @param  array<int, array{referrals: int, completed: int, no_show: int, pending: int, priority_pending: int}>  $referralsByBhc
     * @param  array<int, int>  $lowStockByBhc
     * @param  list<array{type: string, id: int, name: string}>  $withoutStaff
     */
    private function barangays(array $window, array $referralsByBhc, array $lowStockByBhc, array $withoutStaff): array
    {
        $overdueByBhc = $this->overdueFollowUpsByBhc($window);
        $unstaffed = array_flip(array_column(array_filter($withoutStaff, fn (array $f) => $f['type'] === 'bhc'), 'id'));

        return $this->activeBhcs()
            ->map(fn (BarangayHealthCenter $bhc) => [
                'id' => $bhc->id,
                'name' => $bhc->name,
                'barangay' => $bhc->barangay,
                'referrals' => $referralsByBhc[$bhc->id]['referrals'] ?? 0,
                'no_show' => $referralsByBhc[$bhc->id]['no_show'] ?? 0,
                'pending' => $referralsByBhc[$bhc->id]['pending'] ?? 0,
                'overdue_follow_ups' => $overdueByBhc[$bhc->id] ?? 0,
                'low_stock' => $lowStockByBhc[$bhc->id] ?? 0,
                'has_staff' => ! isset($unstaffed[$bhc->id]),
            ])
            ->values()
            ->all();
    }
}
