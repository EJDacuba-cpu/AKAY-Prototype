<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class HealthRecord extends Model
{
    protected $fillable = [
        'patient_id',
        'created_by',
        'barangay_health_center_id',
        'rural_health_unit_id',
        'date_recorded',
        'vital_signs',
        'visit_type',
        'parent_health_record_id',
        'category',
        'maternal_data',
        'immunization_data',
        'monitoring_data',
        'family_planning_data',
        'needs_referral',
        'chief_complaint',
        'diagnosis',
        'treatment_notes',
        'medical_history',
        'notes',
    ];

    protected $casts = [
        'date_recorded' => 'datetime',
        'vital_signs' => 'array',
        'maternal_data' => 'array',
        'immunization_data' => 'array',
        'monitoring_data' => 'array',
        'family_planning_data' => 'array',
        'needs_referral' => 'boolean',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function parentRecord(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_health_record_id');
    }

    public function followUpTask(): HasOne
    {
        return $this->hasOne(FollowUpTask::class);
    }

    public function childRecords(): HasMany
    {
        return $this->hasMany(self::class, 'parent_health_record_id');
    }

    public function dispensedMedicines(): HasMany
    {
        return $this->hasMany(HealthRecordMedicine::class);
    }

    public function referrals(): HasMany
    {
        return $this->hasMany(Referral::class);
    }
}
