<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FollowUpTask extends Model
{
    public const STATE_PENDING = 'pending';
    public const STATE_NO_SHOW = 'no_show';
    public const STATE_RESCHEDULED = 'rescheduled';
    public const STATE_FULFILLED = 'fulfilled';
    public const STATE_CANCELLED = 'cancelled';

    public const ACTIVE_STATES = [
        self::STATE_PENDING,
        self::STATE_RESCHEDULED,
        self::STATE_NO_SHOW,
    ];

    protected $fillable = [
        'health_record_id',
        'patient_id',
        'barangay_health_center_id',
        'rural_health_unit_id',
        'due_date',
        'due_time',
        'purpose',
        'purpose_key',
        'source_entry_id',
        'state',
        'notes',
        'practitioner_id',
        'no_show_at',
        'rescheduled_at',
        'cancelled_at',
        'fulfilled_at',
        'fulfilled_by_health_record_id',
        'rescheduled_to_id',
        'predecessor_task_id',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'due_date' => 'date',
        'no_show_at' => 'datetime',
        'rescheduled_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'fulfilled_at' => 'datetime',
    ];

    protected $appends = [
        'original_health_record_id',
    ];

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
    }

    /**
     * Identity of the consultation that originally scheduled this concern.
     * Prefer the predecessor-task chain (independent returns). Fall back to
     * walking `parentRecord` for legacy rows that re-keyed health_record_id.
     */
    public function getOriginalHealthRecordIdAttribute(): ?int
    {
        $task = $this;
        $guard = 0;
        while ($task !== null && $task->relationLoaded('predecessor') && $task->predecessor !== null) {
            $task = $task->predecessor;
            if (++$guard > 10) {
                break;
            }
        }

        $record = $task?->healthRecord ?? $this->healthRecord;
        $guard = 0;
        while ($record !== null && $record->relationLoaded('parentRecord') && $record->parentRecord !== null) {
            $record = $record->parentRecord;
            if (++$guard > 10) {
                break;
            }
        }

        return $record?->id;
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function barangayHealthCenter(): BelongsTo
    {
        return $this->belongsTo(BarangayHealthCenter::class);
    }

    public function fulfilledByHealthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class, 'fulfilled_by_health_record_id');
    }

    public function practitioner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'practitioner_id');
    }

    /**
     * The task this one was superseded by, when a reschedule created a new
     * row instead of moving this row's due_date. Null means this row is
     * still the current/active one for its health_record_id.
     */
    public function rescheduledTo(): BelongsTo
    {
        return $this->belongsTo(self::class, 'rescheduled_to_id');
    }

    public function predecessor(): BelongsTo
    {
        return $this->belongsTo(self::class, 'predecessor_task_id');
    }

    public function conditionMonitorings(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(ConditionMonitoring::class, 'condition_monitoring_follow_up_task');
    }

    public function isSuperseded(): bool
    {
        return $this->rescheduled_to_id !== null;
    }
}
