<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A condition the RHU has confirmed for a patient. Status is set only by RHU
 * users (feedback or RHU record); BHC never writes it. History lives in
 * PatientConditionEvent. At most one open row per patient and condition_identity.
 */
class PatientCondition extends Model
{
    public const STATUS_UNDER_EVALUATION = 'under_evaluation';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_CONTROLLED = 'controlled';

    public const STATUS_RESOLVED = 'resolved';

    public const STATUS_RULED_OUT = 'ruled_out';

    public const STATUSES = [
        self::STATUS_UNDER_EVALUATION, self::STATUS_ACTIVE, self::STATUS_CONTROLLED,
        self::STATUS_RESOLVED, self::STATUS_RULED_OUT,
    ];

    /** Statuses the partial unique index treats as one live condition. */
    public const OPEN_STATUSES = [self::STATUS_UNDER_EVALUATION, self::STATUS_ACTIVE, self::STATUS_CONTROLLED];

    /** BHC monitoring may start only in these statuses. */
    public const MONITORABLE_STATUSES = [self::STATUS_ACTIVE, self::STATUS_CONTROLLED];

    public const SOURCE_RHU_FEEDBACK = 'rhu_feedback';

    public const SOURCE_RHU_RECORD = 'rhu_record';

    protected $fillable = [
        'patient_id', 'condition_name', 'condition_identity', 'status', 'confirmed_by',
        'confirmed_at', 'source_type', 'source_id', 'bhc_monitoring_recommended_at',
        'bhc_monitoring_recommended_by', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'confirmed_at' => 'datetime',
        'bhc_monitoring_recommended_at' => 'datetime',
    ];

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', self::OPEN_STATUSES);
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(PatientConditionEvent::class);
    }

    public function monitorings(): HasMany
    {
        return $this->hasMany(ConditionMonitoring::class);
    }

    public function confirmedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }
}
