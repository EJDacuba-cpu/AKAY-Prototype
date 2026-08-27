<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A DOC-14 blocked-submission attempt, recorded so the BHW can be notified
 * when the receiving RHU next has an available provider. See plan section 1:
 * this is intent, not a referral - it carries no clinical payload and never
 * feeds ReferralSubmissionGate.
 */
class ReferralHold extends Model
{
    public const STATUS_WAITING = 'waiting';
    public const STATUS_RESUBMITTED = 'resubmitted';
    public const STATUS_DISCARDED = 'discarded';
    public const STATUS_EXPIRED = 'expired';

    protected $fillable = [
        'patient_id',
        'barangay_health_center_id',
        'rural_health_unit_id',
        'created_by',
        'health_record_id',
        'urgency_level',
        'preferred_provider_id',
        'status',
        'last_notified_at',
        'resolved_at',
        'resolved_referral_id',
    ];

    protected $casts = [
        'last_notified_at' => 'datetime',
        'resolved_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
