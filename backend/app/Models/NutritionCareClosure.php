<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NutritionCareClosure extends Model
{
    protected $fillable = [
        'patient_id',
        'started_health_record_id',
        'reason',
        'closed_on',
        'note',
        'closed_by',
    ];

    protected $casts = [
        'closed_on' => 'date:Y-m-d',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function starter(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class, 'started_health_record_id');
    }

    public function closer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }
}
