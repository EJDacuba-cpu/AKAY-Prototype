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
