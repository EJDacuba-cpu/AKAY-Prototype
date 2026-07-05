<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Patient extends Model
{
    protected $fillable = [
        'first_name',
        'middle_name',
        'last_name',
        'sex',
        'birthdate',
        'contact_number',
        'street_address',
        'barangay',
        'municipality',
        'purok_area',
        'civil_status',
        'occupation',
        'philhealth_status',
        'spouse_name',
        'spouse_occupation',
        'registration_type',
        'mother_name',
        'father_name',
        'guardian_name',
        'guardian_relationship',
        'guardian_contact_number',
        'family_serial_number',
        'birth_place',
        'birth_time',
        'birth_weight',
        'birth_height',
        'nhts_status',
        'philhealth_number',
        'philhealth_category',
        'patient_category',
        'status',
        'created_by',
        'barangay_health_center_id',
        'rural_health_unit_id',
    ];

    protected $casts = [
        'birthdate' => 'date',
        'birth_time' => 'datetime:H:i',
        'birth_weight' => 'decimal:2',
        'birth_height' => 'decimal:2',
    ];

    protected $appends = ['full_name', 'age'];

    protected function fullName(): Attribute
    {
        return Attribute::get(fn () => trim(collect([
            $this->first_name,
            $this->middle_name,
            $this->last_name,
        ])->filter()->implode(' ')));
    }

    protected function age(): Attribute
    {
        return Attribute::get(fn () => $this->birthdate?->age);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function barangayHealthCenter(): BelongsTo
    {
        return $this->belongsTo(BarangayHealthCenter::class);
    }

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function healthRecords(): HasMany
    {
        return $this->hasMany(HealthRecord::class);
    }

    public function referrals(): HasMany
    {
        return $this->hasMany(Referral::class);
    }
}
