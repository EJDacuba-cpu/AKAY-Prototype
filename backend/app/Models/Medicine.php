<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Medicine extends Model
{
    protected $fillable = [
        'name',
        'category',
        'description',
        'quantity',
        'unit',
        'availability_status',
        'expiration_date',
        'rural_health_unit_id',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'expiration_date' => 'date',
    ];

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }
}
