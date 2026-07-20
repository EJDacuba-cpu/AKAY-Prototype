<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Referral extends Model
{
    public const STATUS_PENDING = 'Pending';
    public const STATUS_RECEIVED = 'Received';
    public const STATUS_FOR_MONITORING = 'For Monitoring';
    public const STATUS_NO_SHOW = 'No-Show';
    public const STATUS_COMPLETED = 'Completed';

    protected $fillable = [
        'tracking_id',
        'qr_code_value',
        'qr_token_hash',
        'qr_token_encrypted',
        'qr_token_issued_at',
        'qr_token_last_used_at',
        'client_submission_id',
        'patient_id',
        'health_record_id',
        'barangay_health_center_id',
        'rural_health_unit_id',
        'created_by',
        'referral_category',
        'urgency_level',
        'reason_for_referral',
        'chief_complaint',
        'initial_diagnosis',
        'initial_action_taken',
        'referring_practitioner',
        'referral_datetime',
        'status',
        'remarks',
    ];

    protected $casts = [
        'referral_datetime' => 'datetime',
        'qr_token_issued_at' => 'datetime',
        'qr_token_last_used_at' => 'datetime',
    ];

    protected $hidden = [
        'qr_code_value',
        'qr_token_hash',
        'qr_token_encrypted',
        'qr_token_issued_at',
        'qr_token_last_used_at',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
    }

    public function barangayHealthCenter(): BelongsTo
    {
        return $this->belongsTo(BarangayHealthCenter::class);
    }

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updates(): HasMany
    {
        return $this->hasMany(ReferralUpdate::class);
    }

    public function feedback(): HasOne
    {
        return $this->hasOne(Feedback::class);
    }
}
