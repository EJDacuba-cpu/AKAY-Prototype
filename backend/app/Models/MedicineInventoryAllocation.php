<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

class MedicineInventoryAllocation extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Inventory allocations are append-only.'));
        static::deleting(fn () => throw new LogicException('Inventory allocations are append-only.'));
    }

    public function expiryGroup()
    {
        return $this->belongsTo(MedicineExpiryGroup::class, 'expiry_group_id');
    }
}
