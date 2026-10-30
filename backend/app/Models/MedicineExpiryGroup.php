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
        return ! $this->expiry_not_applicable
            && $this->expiration_date !== null
            && $this->expiration_date->toDateString() < Medicine::facilityCalendarDate();
    }

    public function isEligibleToDispense(?string $today = null): bool
    {
        if ((int) $this->available_quantity <= 0) {
            return false;
        }
        if ($this->expiry_not_applicable) {
            return true;
        }

        $date = $this->expiration_date?->toDateString();

        return $date !== null && $date >= ($today ?? Medicine::facilityCalendarDate());
    }

    public function toAvailabilityArray(): array
    {
        return [
            'id' => (int) $this->id,
            'expiration_date' => $this->expiration_date?->toDateString(),
            'expiry_not_applicable' => (bool) $this->expiry_not_applicable,
            'available_quantity' => (int) $this->available_quantity,
            'quarantined_quantity' => (int) $this->quarantined_quantity,
            'is_expired' => $this->is_expired,
        ];
    }
}
