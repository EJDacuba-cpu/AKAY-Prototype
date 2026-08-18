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
    // Legacy rows may still use this value; workflow code treats it as Received.
    public const STATUS_FOR_MONITORING = 'For Monitoring';
    public const STATUS_NO_SHOW = 'No-Show';
    public const STATUS_COMPLETED = 'Completed';

    public const WORKFLOW_STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_RECEIVED,
        self::STATUS_NO_SHOW,
        self::STATUS_COMPLETED,
    ];

    // URG-01..URG-06: attention is a workflow handling hint, never a clinical
    // or triage classification (URG-04, SFT-01). The retired four-value scheme
    // (Low/Normal/Urgent/Emergency) is replaced outright, not mapped forward.
    public const ATTENTION_ROUTINE = 'Routine';
    public const ATTENTION_PRIORITY = 'Priority';

    public const ATTENTION_LEVELS = [
        self::ATTENTION_ROUTINE,
        self::ATTENTION_PRIORITY,
    ];

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
        'preferred_doctor',
        'preferred_provider_id',
        'preferred_provider_snapshot',
        'availability_snapshot',
        'preference_acknowledged_at',
        'rescheduled_to',
        'reschedule_reason',
        'rescheduled_by',
        'rescheduled_at',
        'referral_datetime',
        'status',
        'remarks',
    ];

    protected $casts = [
        'referral_datetime' => 'datetime',
        'preferred_provider_snapshot' => 'array',
        'availability_snapshot' => 'array',
        'preference_acknowledged_at' => 'datetime',
        'rescheduled_to' => 'datetime',
        'rescheduled_at' => 'datetime',
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

    public static function normalizeWorkflowStatus(mixed $status): ?string
    {
        $normalized = strtolower(trim((string) $status));
        $normalized = preg_replace('/[\s_-]+/', ' ', $normalized) ?: '';

        return match ($normalized) {
            'pending' => self::STATUS_PENDING,
            'received', 'for monitoring' => self::STATUS_RECEIVED,
            'no show' => self::STATUS_NO_SHOW,
            'completed', 'complete', 'done' => self::STATUS_COMPLETED,
            default => null,
        };
    }
}
