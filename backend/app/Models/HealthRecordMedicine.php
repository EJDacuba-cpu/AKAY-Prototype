<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HealthRecordMedicine extends Model
{
    protected $fillable = [
        'health_record_id',
        'medicine_id',
        'medicine_name_snapshot',
        'category_snapshot',
        'quantity',
        'unit',
        'remarks',
        'dispensed_by',
        'barangay_health_center_id',
    ];

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
    }

    public function medicine(): BelongsTo
    {
        return $this->belongsTo(Medicine::class);
    }

    public function dispenser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dispensed_by');
    }
}
