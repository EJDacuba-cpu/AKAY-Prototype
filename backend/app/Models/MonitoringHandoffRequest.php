<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MonitoringHandoffRequest extends Model
{
    public const STATUS_PENDING_REVIEW = 'pending_review';

    public const STATUS_LINKAGE_NEEDED = 'linkage_needed';

    public const STATUS_ACCEPTED_AWAITING_FIRST_VISIT = 'accepted_awaiting_first_visit';

    public const STATUS_MONITORING_ACTIVE = 'monitoring_active';

    public const STATUS_DECLINED = 'declined';

    public const STATUS_REDIRECTED = 'redirected';

    public const STATUSES = [
        self::STATUS_PENDING_REVIEW,
        self::STATUS_LINKAGE_NEEDED,
        self::STATUS_ACCEPTED_AWAITING_FIRST_VISIT,
        self::STATUS_MONITORING_ACTIVE,
        self::STATUS_DECLINED,
        self::STATUS_REDIRECTED,
    ];

    public const STARTABLE_STATUSES = [
        self::STATUS_ACCEPTED_AWAITING_FIRST_VISIT,
        self::STATUS_MONITORING_ACTIVE,
    ];

    public const BLOCKED_START_STATUSES = [
        self::STATUS_PENDING_REVIEW,
        self::STATUS_LINKAGE_NEEDED,
        self::STATUS_DECLINED,
        self::STATUS_REDIRECTED,
    ];

    protected $fillable = [
        'patient_id',
        'linked_patient_id',
        'patient_condition_id',
        'health_record_id',
        'sending_rural_health_unit_id',
        'receiving_barangay_health_center_id',
        'recommendation',
        'status',
        'decline_reason',
        'redirected_to_bhc_id',
        'created_by',
        'reviewed_by',
        'reviewed_at',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function linkedPatient(): BelongsTo
    {
        return $this->belongsTo(Patient::class, 'linked_patient_id');
    }

    public function patientCondition(): BelongsTo
    {
        return $this->belongsTo(PatientCondition::class);
    }

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
    }

    public function sendingRuralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class, 'sending_rural_health_unit_id');
    }

    public function receivingBarangayHealthCenter(): BelongsTo
    {
        return $this->belongsTo(BarangayHealthCenter::class, 'receiving_barangay_health_center_id');
    }

    public function redirectedToBhc(): BelongsTo
    {
        return $this->belongsTo(BarangayHealthCenter::class, 'redirected_to_bhc_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function reviewPatientId(): int
    {
        return (int) ($this->linked_patient_id ?: $this->patient_id);
    }
}
