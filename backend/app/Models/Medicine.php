<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Medicine extends Model
{
    protected $fillable = [
        'name',
        'category',
        'description',
        'quantity',
        'low_stock_threshold',
        'unit',
        'availability_status',
        'expiration_date',
        'rural_health_unit_id',
        'barangay_health_center_id',
        'created_by',
        'updated_by',
        'is_active',
        'archived_at',
    ];

    protected $casts = [
        'expiration_date' => 'date',
        'is_active' => 'boolean',
        'archived_at' => 'datetime',
    ];

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function barangayHealthCenter(): BelongsTo
    {
        return $this->belongsTo(BarangayHealthCenter::class);
    }

    public function inventoryTransactions(): HasMany
    {
        return $this->hasMany(MedicineInventoryTransaction::class);
    }
}
