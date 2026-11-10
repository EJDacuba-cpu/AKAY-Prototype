<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TbCaseEndorsement extends Model
{
    public const ACTIVE_STATUSES = ['linkage_needed', 'pending_review', 'accepted'];

    public const READABLE_STATUSES = ['pending_review', 'accepted'];

    protected $guarded = ['id'];

    protected $hidden = ['request_key', 'request_hash'];

    protected $casts = ['patient_snapshot' => 'array', 'version' => 'integer',
        'endorsed_at' => 'datetime', 'linked_at' => 'datetime', 'reviewed_at' => 'datetime', 'revoked_at' => 'datetime'];

    public function tbCase(): BelongsTo
    {
        return $this->belongsTo(TbTreatmentCase::class, 'tb_treatment_case_id');
    }

    public function receivingBhc(): BelongsTo
    {
        return $this->belongsTo(BarangayHealthCenter::class, 'receiving_bhc_id');
    }

    public function linkedPatient(): BelongsTo
    {
        return $this->belongsTo(Patient::class, 'linked_patient_id');
    }

    public function scopeReadableAtBhc(Builder $query, int $bhcId): Builder
    {
        return $query->where('receiving_bhc_id', $bhcId)->whereIn('status', self::READABLE_STATUSES)
            ->whereHas('receivingBhc', fn ($bhc) => $bhc->where('status', 'active'))
            ->whereHas('linkedPatient', fn ($patient) => $patient->where('barangay_health_center_id', $bhcId)->where('status', 'active'));
    }
}
