<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MedicineExpiryGroup extends Model
{
    protected $fillable = ['medicine_id', 'expiration_date', 'expiry_not_applicable', 'available_quantity', 'quarantined_quantity'];

    protected $casts = ['expiration_date' => 'date:Y-m-d', 'expiry_not_applicable' => 'boolean', 'available_quantity' => 'integer', 'quarantined_quantity' => 'integer'];

    protected $appends = ['is_expired'];

    public function getIsExpiredAttribute(): bool
    {
        return $this->expiration_date !== null && $this->expiration_date->toDateString() < Medicine::facilityCalendarDate();
    }
}
