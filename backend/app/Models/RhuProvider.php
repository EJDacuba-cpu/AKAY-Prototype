<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
        'remarks',
        'expected_available_at',
        'is_active',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'expected_available_at' => 'datetime',
    ];

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
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
}
