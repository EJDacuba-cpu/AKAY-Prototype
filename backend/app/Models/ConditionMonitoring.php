<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * BHC monitoring of one patient condition. Changed only by saving a
 * consultation (App\Services\ConditionMonitoringService). Never carries the
 * clinical status - that stays in Current Conditions.
 */
class ConditionMonitoring extends Model
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_STOPPED = 'stopped';

    protected $fillable = [
        'patient_id', 'barangay_health_center_id', 'condition_key', 'condition_name',
        'condition_identity', 'status', 'started_health_record_id', 'started_at',
        'stopped_health_record_id', 'stopped_at', 'stop_reason', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'stopped_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function visits(): HasMany
    {
        return $this->hasMany(ConditionMonitoringVisit::class);
    }

    public function followUpTasks(): BelongsToMany
    {
        return $this->belongsToMany(FollowUpTask::class, 'condition_monitoring_follow_up_task');
    }
}
