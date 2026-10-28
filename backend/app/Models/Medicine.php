<?php

namespace App\Models;

use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class Medicine extends Model
{
    public const FACILITY_TIMEZONE = 'Asia/Manila';

    protected $fillable = [
        'name',
        'item_type',
        'category',
        'description',
        'quantity',
        'reconciliation_required',
        'low_stock_threshold',
        'unit',
        'availability_status',
        'expiration_date',
        'rural_health_unit_id',
        'barangay_health_center_id',
        'created_by',
        'updated_by',
        'is_active',
        'archived_at',
        'idempotency_key',
        'idempotency_hash',
    ];

    protected $hidden = [
        'idempotency_key',
        'idempotency_hash',
    ];

    protected $appends = ['stock_summary'];

    public function expiryGroups(): HasMany
    {
        return $this->hasMany(MedicineExpiryGroup::class)->orderBy('id');
    }

    public function getStockSummaryAttribute(): array
    {
        $groups = $this->expiryGroups;
        $available = $expired = $quarantined = 0;
        foreach ($groups as $group) {
            $quarantined += $group->quarantined_quantity;
            if ($group->is_expired) {
                $expired += $group->available_quantity;
            } else {
                $available += $group->available_quantity;
            }
        }
        $snapshot = [$this->quantity, (bool) $this->reconciliation_required, $groups->map(fn ($g) => [$g->id, $g->available_quantity, $g->quarantined_quantity])->all(), $this->inventoryTransactions()->max('id')];

        return ['recorded' => (int) $this->quantity, 'available' => $available, 'quarantined' => $quarantined, 'expired' => $expired,
            'unassigned' => (int) $this->quantity - $available - $expired - $quarantined,
            'snapshot' => hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR))];
    }

    protected $casts = [
        'expiration_date' => 'date:Y-m-d',
        'is_active' => 'boolean',
        'reconciliation_required' => 'boolean',
        'archived_at' => 'datetime',
    ];

    public static function facilityCalendarDate(?DateTimeInterface $now = null): string
    {
        $moment = $now ? Carbon::parse($now) : now();

        return $moment->copy()->timezone(self::FACILITY_TIMEZONE)->toDateString();
    }

    public function expirationCalendarDate(): ?string
    {
        $raw = $this->getRawOriginal('expiration_date') ?? $this->attributes['expiration_date'] ?? null;
        if ($raw === null || $raw === '') {
            return null;
        }

        if (is_string($raw)) {
            $date = substr($raw, 0, 10);

            return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1 ? $date : null;
        }

        return $this->expiration_date?->toDateString();
    }

    public function isExpiredOnFacilityCalendar(?DateTimeInterface $now = null): bool
    {
        $expiry = $this->expirationCalendarDate();

        return $expiry !== null && $expiry < self::facilityCalendarDate($now);
    }

    public function expiresTodayOnFacilityCalendar(?DateTimeInterface $now = null): bool
    {
        $expiry = $this->expirationCalendarDate();

        return $expiry !== null && $expiry === self::facilityCalendarDate($now);
    }

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function barangayHealthCenter(): BelongsTo
    {
        return $this->belongsTo(BarangayHealthCenter::class);
    }

    public function inventoryTransactions(): HasMany
    {
        return $this->hasMany(MedicineInventoryTransaction::class);
    }
}
