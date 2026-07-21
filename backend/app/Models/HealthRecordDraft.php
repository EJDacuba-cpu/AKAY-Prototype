<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HealthRecordDraft extends Model
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_CONSUMED = 'consumed';

    public const STATUS_DISCARDED = 'discarded';

    public const STATUS_EXPIRED = 'expired';

    protected $fillable = [
        'public_id',
        'owner_user_id',
        'barangay_health_center_id',
        'patient_id',
        'classification',
        'encrypted_payload',
        'version',
        'status',
        'consumed_health_record_id',
        'expires_at',
        'last_saved_at',
    ];

    protected $hidden = [
        'id',
        'owner_user_id',
        'barangay_health_center_id',
        'patient_id',
        'encrypted_payload',
        'consumed_health_record_id',
    ];

    protected $casts = [
        'version' => 'integer',
        'expires_at' => 'datetime',
        'last_saved_at' => 'datetime',
    ];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function barangayHealthCenter(): BelongsTo
    {
        return $this->belongsTo(BarangayHealthCenter::class);
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function consumedHealthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class, 'consumed_health_record_id');
    }
}
