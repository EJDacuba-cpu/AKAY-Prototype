<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TbMonitoringEntry extends Model
{
    protected $guarded = ['id'];

    protected $casts = ['observed_on' => 'date:Y-m-d', 'weight_kg' => 'decimal:2', 'voided' => 'boolean',
        'version' => 'integer', 'recorded_at' => 'datetime'];

    public function tbCase(): BelongsTo
    {
        return $this->belongsTo(TbTreatmentCase::class, 'tb_treatment_case_id');
    }

    public function revisions(): HasMany
    {
        return $this->hasMany(TbMonitoringRevision::class);
    }

    public function barangayHealthCenter(): BelongsTo
    {
        return $this->belongsTo(BarangayHealthCenter::class);
    }
}
