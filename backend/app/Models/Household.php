<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Household extends Model
{
    protected $fillable = ['barangay_health_center_id', 'rural_health_unit_id', 'serial_number', 'address', 'head_patient_id', 'archived_at', 'version'];

    protected $casts = ['address' => 'array', 'archived_at' => 'datetime', 'version' => 'integer'];

    public function members(): HasMany
    {
        return $this->hasMany(Patient::class);
    }
}
