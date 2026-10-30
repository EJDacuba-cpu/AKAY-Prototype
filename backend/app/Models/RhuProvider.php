<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * An RHU-managed provider (DOC-20). Availability is per-provider (DOC-21) and
 * aggregated at read time for the RHU-level view (DOC-19).
 *
 * Official RHU Doctor accounts own a row through user_id. Identity then
 * comes from the Admin-managed account; availability remains RHU-managed.
 * Unlinked covering/legacy rows are retained for history and excluded from
 * the active roster and referral calculations.
 *
 * DOC-15a-V: no default/fallback/covering attribute exists here by design.
 */
class RhuProvider extends Model
{
    public const STATUS_AVAILABLE = 'Available';
    public const STATUS_UNAVAILABLE = 'Unavailable';

    public const AVAILABILITY_STATUSES = [
        self::STATUS_AVAILABLE,
        self::STATUS_UNAVAILABLE,
    ];

    protected $fillable = [
        'rural_health_unit_id',
        'user_id',
        'name',
        'specialization',
        'availability_status',
        'availability_status_set_at',
        'remarks',
        'internal_notes',
        'expected_available_at',
        'is_active',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'expected_available_at' => 'datetime',
        'availability_status_set_at' => 'datetime',
    ];

    protected $hidden = [
        'unavailability',
        'internal_notes',
    ];

    protected $appends = [
        'effective_availability_status',
    ];

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function unavailability(): HasMany
    {
        return $this->hasMany(RhuProviderUnavailability::class);
    }

    public function isOfficial(): bool
    {
        return $this->user_id !== null;
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * Live roster and DOC-14: active official accounts only.
     */
    public function scopeEligibleRoster(Builder $query): Builder
    {
        return $query->where('is_active', true)->whereNotNull('user_id');
    }

    public function isAvailable(): bool
    {
        return $this->availability_status === self::STATUS_AVAILABLE;
    }

    public function isEffectivelyAvailable(?Carbon $now = null): bool
    {
        if (! $this->isOfficial() || ! $this->is_active) {
            return false;
        }
        if ($this->availability_status !== self::STATUS_AVAILABLE) {
            return false;
        }

        $now = $now
            ? Carbon::parse($now)->timezone(RhuProviderUnavailability::TIMEZONE)
            : now(RhuProviderUnavailability::TIMEZONE);
        $confirmedAt = $this->availability_status_set_at
            ? Carbon::parse($this->availability_status_set_at)->timezone(RhuProviderUnavailability::TIMEZONE)
            : null;

        foreach ($this->unavailability as $exception) {
            if ($exception->windowStart()->gt($now)) {
                continue;
            }
            if ($confirmedAt === null || $exception->windowEnd()->gt($confirmedAt)) {
                return false;
            }
        }

        return true;
    }

    public function getEffectiveAvailabilityStatusAttribute(): string
    {
        return $this->isEffectivelyAvailable()
            ? self::STATUS_AVAILABLE
            : self::STATUS_UNAVAILABLE;
    }

    /**
     * Display-only: a passed estimate never restores eligibility.
     */
    public function isExpectedReturnOverdue(?Carbon $now = null): bool
    {
        if ($this->expected_available_at === null || $this->isEffectivelyAvailable($now)) {
            return false;
        }

        $now = $now
            ? Carbon::parse($now)->timezone(RhuProviderUnavailability::TIMEZONE)
            : now(RhuProviderUnavailability::TIMEZONE);

        return Carbon::parse($this->expected_available_at)
            ->timezone(RhuProviderUnavailability::TIMEZONE)
            ->lte($now);
    }

    /**
     * BHC/referral snapshot fields. Internal notes are never included.
     */
    public function toPublicAvailabilityArray(): array
    {
        $overdue = $this->isExpectedReturnOverdue();

        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'name' => $this->name,
            'specialization' => $this->specialization,
            'availability_status' => $this->availability_status,
            'effective_availability_status' => $this->effective_availability_status,
            'remarks' => $this->remarks,
            'expected_available_at' => $overdue ? null : $this->expected_available_at,
            'awaiting_rhu_update' => $overdue,
            'updated_at' => $this->updated_at,
        ];
    }
}
