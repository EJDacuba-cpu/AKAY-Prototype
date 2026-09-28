<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CarePathwayEncounter extends Model
{
    public const KIND_STARTED = 'started';
    public const KIND_CONTINUED = 'continued';
    public const KIND_LEGACY_LINKED = 'legacy_linked';

    public $timestamps = false;

    protected $fillable = ['enrollment_id', 'health_record_id', 'kind', 'field_data', 'created_at'];

    protected $casts = [
        'field_data' => 'array',
        'created_at' => 'datetime',
    ];

    public function enrollment(): BelongsTo
    {
        return $this->belongsTo(CarePathwayEnrollment::class, 'enrollment_id');
    }

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
    }
}
