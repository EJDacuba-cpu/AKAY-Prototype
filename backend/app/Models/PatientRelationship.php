<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One explicit spouse/sibling pair, stored once with patient_id < relative_id. */
class PatientRelationship extends Model
{
    public const TYPE_SPOUSE = 'spouse';

    public const TYPE_SIBLING = 'sibling';

    public const TYPES = [self::TYPE_SPOUSE, self::TYPE_SIBLING];

    protected $fillable = ['barangay_health_center_id', 'patient_id', 'relative_id', 'type', 'created_by'];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class, 'patient_id');
    }

    public function relative(): BelongsTo
    {
        return $this->belongsTo(Patient::class, 'relative_id');
    }
}
