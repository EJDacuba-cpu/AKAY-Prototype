<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Append-only: one row per ITR that started, continued or stopped a monitoring record. */
class ConditionMonitoringVisit extends Model
{
    public const ACTION_STARTED = 'started';

    public const ACTION_CONTINUED = 'continued';

    public const ACTION_STOPPED = 'stopped';

    public $timestamps = false;

    protected $fillable = ['condition_monitoring_id', 'health_record_id', 'action', 'referred', 'created_at'];

    protected $casts = [
        'referred' => 'boolean',
        'created_at' => 'datetime',
    ];

    public function monitoring(): BelongsTo
    {
        return $this->belongsTo(ConditionMonitoring::class, 'condition_monitoring_id');
    }

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
    }
}
