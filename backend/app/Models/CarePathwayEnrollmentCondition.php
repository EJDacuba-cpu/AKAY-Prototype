<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CarePathwayEnrollmentCondition extends Model
{
    protected $fillable = [
        'enrollment_id', 'condition_name', 'field_set_key', 'diagnosis_ref',
        'added_health_record_id', 'removed_health_record_id', 'removed_at',
    ];

    protected $casts = [
        'removed_at' => 'datetime',
    ];

    public function enrollment(): BelongsTo
    {
        return $this->belongsTo(CarePathwayEnrollment::class, 'enrollment_id');
    }

    public function isActive(): bool
    {
        return $this->removed_at === null;
    }
}
