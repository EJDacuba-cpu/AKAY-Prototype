<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One RHU patient visit in the daily queue. Independent of referral status
 * and of the clinical record: closed_at IS NULL means the visit is active.
 */
class RhuVisitQueueEntry extends Model
{
    public const SOURCE_REFERRAL = 'referral';
    public const SOURCE_WALK_IN = 'walk_in';

    public const STATUS_WAITING = 'waiting';

    public const STATUS_IN_CONSULTATION = 'in_consultation';

    public const STATUS_CLOSED = 'closed';

    public const CLOSE_REASON_LEFT = 'left_before_consultation';

    public const CLOSE_REASON_MISTAKE = 'checked_in_by_mistake';

    public const CLOSE_REASON_OTHER = 'other';

    /** Written only when a consultation is finalized (D11). Not a Close-visit modal reason. */
    public const CLOSE_REASON_COMPLETED = 'consultation_completed';

    public const CLOSE_REASONS = [
        self::CLOSE_REASON_LEFT,
        self::CLOSE_REASON_MISTAKE,
        self::CLOSE_REASON_OTHER,
    ];

    protected $fillable = [
        'rural_health_unit_id',
        'patient_id',
        'referral_id',
        'source',
        'status',
        'checked_in_at',
        'closed_at',
        'checked_in_by',
        'closed_by',
        'close_reason',
        'close_note',
        'consultation_uuid',
        'check_in_key',
    ];

    protected $casts = [
        'checked_in_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function referral(): BelongsTo
    {
        return $this->belongsTo(Referral::class);
    }

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function checkedInBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'checked_in_by');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('closed_at');
    }
}
