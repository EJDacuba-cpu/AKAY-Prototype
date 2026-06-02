<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HealthRecord extends Model
{
    protected $fillable = [
        'patient_id',
        'created_by',
        'barangay_health_center_id',
        'rural_health_unit_id',
        'date_recorded',
        'vital_signs',
        'category',
        'chief_complaint',
        'diagnosis',
        'treatment_notes',
        'medical_history',
        'notes',
    ];

    protected $casts = [
        'date_recorded' => 'datetime',
        'vital_signs' => 'array',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
