<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One status change of a PatientCondition. Append-only: written when the
 * RHU sets a status, never updated. Has changed_at instead of timestamps.
 */
class PatientConditionEvent extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'patient_condition_id', 'from_status', 'to_status', 'note', 'source_type',
        'source_id', 'changed_by', 'changed_at',
    ];

    protected $casts = [
        'changed_at' => 'datetime',
    ];

    public function condition(): BelongsTo
    {
        return $this->belongsTo(PatientCondition::class, 'patient_condition_id');
    }

    public function changedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
