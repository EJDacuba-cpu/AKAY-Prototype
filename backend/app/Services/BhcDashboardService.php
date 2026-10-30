<?php

namespace App\Services;

use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Operational counts for a BHC dashboard. Facility comes from the authenticated
 * user. The payload is counts only — no patient names or clinical text.
 */
class BhcDashboardService
{
    public const TIMEZONE = Medicine::FACILITY_TIMEZONE;

    public const ACTIVITY_DAYS = 30;

    public const EXPIRY_SOON_DAYS = 30;

    public const INVENTORY_ITEM_LIMIT = 3;

    public function __construct(private readonly FacilityAccessService $facilityAccess) {}

    public function summary(User $user, ?CarbonImmutable $now = null): array
    {
        $now = ($now ?? CarbonImmutable::now(self::TIMEZONE))->timezone(self::TIMEZONE);
        $today = $now->toDateString();
        $access = [
            'patients' => ActionPermissions::allows($user, 'patients.register'),
            'clinical' => ActionPermissions::allows($user, 'clinical.history'),
            'inventory' => ActionPermissions::allows($user, 'inventory.view'),
        ];
        $inventory = $access['inventory'] ? $this->inventoryAlerts($user, $today) : null;

        return [
            'facility' => [
                'name' => $user->barangayHealthCenter?->name ?: 'Barangay Health Center',
            ],
            'access' => $access,
            'kpis' => [
                'registered_patients' => $access['patients'] ? $this->registeredPatients($user) : null,
                'consultations_today' => $access['clinical'] ? $this->consultationsOn($user, $today) : null,
                'open_referrals' => $access['clinical'] ? $this->openReferrals($user) : null,
                'follow_ups_due_today' => $access['clinical'] ? $this->followUpsDueToday($user, $today) : null,
            ],
            'consultation_activity' => $access['clinical'] ? [
                'series' => $this->consultationSeries($user, $today),
            ] : null,
            'attention' => [
                'overdue_follow_ups' => $access['clinical'] ? $this->overdueFollowUps($user, $today) : null,
                'pending_rhu_feedback' => $access['clinical'] ? $this->pendingRhuFeedback($user) : null,
                'inventory_alerts' => $inventory['count'] ?? null,
                'inventory_items' => $inventory['items'] ?? null,
            ],
            'generated_at' => $now->toIso8601String(),
        ];
    }

    private function registeredPatients(User $user): int
    {
        return $this->facilityAccess->scopePatients(Patient::query(), $user)->count();
    }

    private function consultationsOn(User $user, string $day): int
    {
        return $this->recordsOn($user, $day, $day)->count();
    }

    /**
     * @return list<array{date: string, count: int}>
     */
    private function consultationSeries(User $user, string $today): array
    {
        $end = CarbonImmutable::parse($today, self::TIMEZONE)->startOfDay();
        $start = $end->subDays(self::ACTIVITY_DAYS - 1);
        $counts = [];
        for ($cursor = $start; $cursor <= $end; $cursor = $cursor->addDay()) {
            $counts[$cursor->toDateString()] = 0;
        }

        $this->recordsOn($user, $start->toDateString(), $today)
            ->toBase()
            ->get(['date_recorded'])
            ->each(function (object $row) use (&$counts): void {
                $day = substr((string) $row->date_recorded, 0, 10);
                if (isset($counts[$day])) {
                    $counts[$day]++;
                }
            });

        return collect($counts)
            ->map(fn (int $count, string $date) => ['date' => $date, 'count' => $count])
            ->values()
            ->all();
    }

    private function openReferrals(User $user): int
    {
        return $this->referrals($user)
            ->whereIn('status', $this->openReferralStatuses())
            ->count();
    }

    private function pendingRhuFeedback(User $user): int
    {
        return $this->referrals($user)
            ->whereIn('status', [Referral::STATUS_RECEIVED, Referral::STATUS_FOR_MONITORING])
            ->count();
    }

    private function followUpsDueToday(User $user, string $today): int
    {
        return $this->actionableFollowUps($user)
            ->whereIn('state', [FollowUpTask::STATE_PENDING, FollowUpTask::STATE_RESCHEDULED])
            ->whereDate('due_date', $today)
            ->count();
    }

    private function overdueFollowUps(User $user, string $today): int
    {
        return $this->actionableFollowUps($user)
            ->whereIn('state', FollowUpTask::ACTIVE_STATES)
            ->whereDate('due_date', '<', $today)
            ->count();
    }

    /**
     * @return array{count: int, items: list<array{name: string, status: string}>}
     */
    private function inventoryAlerts(User $user, string $today): array
    {
        $soon = CarbonImmutable::parse($today, self::TIMEZONE)->addDays(self::EXPIRY_SOON_DAYS)->toDateString();
        $medicines = Medicine::query()
            ->where('is_active', true)
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->whereNull('rural_health_unit_id')
            ->with('expiryGroups')
            ->where(function (Builder $query) use ($soon): void {
                $query->whereIn('availability_status', ['Low Stock', 'Unavailable'])
                    ->orWhereHas('expiryGroups', function (Builder $groups) use ($soon): void {
                        $groups->where('available_quantity', '>', 0)
                            ->where(function (Builder $dated) use ($soon): void {
                                $dated->where('expiry_not_applicable', false)
                                    ->orWhereNull('expiry_not_applicable');
                            })
                            ->whereNotNull('expiration_date')
                            ->whereDate('expiration_date', '<=', $soon);
                    });
            })
            ->orderBy('name')
            ->get();

        $items = $medicines
            ->map(fn (Medicine $medicine) => [
                'name' => (string) $medicine->name,
                'status' => $this->inventoryStatusLabel($medicine, $today),
            ])
            ->take(self::INVENTORY_ITEM_LIMIT)
            ->values()
            ->all();

        return [
            'count' => $medicines->count(),
            'items' => $items,
        ];
    }

    private function inventoryStatusLabel(Medicine $medicine, string $today): string
    {
        $availability = (string) $medicine->availability_status;
        if (in_array($availability, ['Low Stock', 'Unavailable'], true)) {
            return $availability;
        }

        $soon = CarbonImmutable::parse($today, self::TIMEZONE)->addDays(self::EXPIRY_SOON_DAYS)->toDateString();
        $dates = $medicine->expiryGroups
            ->filter(fn ($group) => (int) $group->available_quantity > 0 && $group->expiration_date)
            ->map(fn ($group) => $group->expiration_date->toDateString())
            ->sort()
            ->values();
        $earliest = $dates->first();
        if ($earliest === null) {
            return $availability !== '' ? $availability : 'Alert';
        }
        if ($earliest < $today) {
            return 'Expired';
        }
        if ($earliest === $today) {
            return 'Expires Today';
        }
        if ($earliest <= $soon) {
            return 'Expiring Soon';
        }

        return $availability !== '' ? $availability : 'Alert';
    }

    private function records(User $user): Builder
    {
        return $this->facilityAccess->scopeHealthRecords(HealthRecord::query(), $user);
    }

    private function recordsOn(User $user, string $fromDay, string $toDay): Builder
    {
        $start = CarbonImmutable::parse($fromDay, self::TIMEZONE)->startOfDay();
        $end = CarbonImmutable::parse($toDay, self::TIMEZONE)->startOfDay()->addDay();

        return $this->records($user)
            ->where('date_recorded', '>=', $start->toDateTimeString())
            ->where('date_recorded', '<', $end->toDateTimeString());
    }

    private function referrals(User $user): Builder
    {
        return $this->facilityAccess->scopeReferrals(Referral::query(), $user);
    }

    private function actionableFollowUps(User $user): Builder
    {
        return $this->facilityAccess
            ->scopeFollowUpTasks(FollowUpTask::query(), $user)
            ->whereNull('rescheduled_to_id')
            ->whereNull('fulfilled_at');
    }

    /**
     * @return list<string>
     */
    private function openReferralStatuses(): array
    {
        return [
            Referral::STATUS_PENDING,
            Referral::STATUS_RECEIVED,
            Referral::STATUS_FOR_MONITORING,
        ];
    }
}
