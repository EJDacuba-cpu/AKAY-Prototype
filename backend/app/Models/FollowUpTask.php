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

    protected $fillable = [
        'health_record_id',
        'patient_id',
        'barangay_health_center_id',
        'due_date',
        'state',
        'notes',
        'no_show_at',
        'rescheduled_at',
        'fulfilled_at',
        'fulfilled_by_health_record_id',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'due_date' => 'date',
        'no_show_at' => 'datetime',
        'rescheduled_at' => 'datetime',
        'fulfilled_at' => 'datetime',
    ];

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
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
}
