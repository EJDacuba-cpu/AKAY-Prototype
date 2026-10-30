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
        'status',
        'discard_reason',
        'discarded_by',
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

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
    }

    public function discardedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'discarded_by');
    }

    public function pendingReferral(): array
    {
        $monitoring = $this->healthRecord?->monitoring_data ?? [];
        $shared = is_array($monitoring['pendingReferral'] ?? null)
            ? $monitoring['pendingReferral']
            : [];
        $fromOutcome = collect($monitoring['conditionReferralOutcomes'] ?? [])
            ->first(fn ($outcome) => (int) ($outcome['holdId'] ?? 0) === (int) $this->id);

        return is_array($fromOutcome['pendingReferral'] ?? null)
            ? $fromOutcome['pendingReferral']
            : $shared;
    }

    public function toWaitingArray(): array
    {
        $pending = $this->pendingReferral();
        $record = $this->healthRecord;

        return [
            'id' => $this->id,
            'patient_id' => $this->patient_id,
            'patient' => $this->patient,
            'rural_health_unit_id' => $this->rural_health_unit_id,
            'rural_health_unit' => $this->ruralHealthUnit,
            'health_record_id' => $this->health_record_id,
            'urgency_level' => $this->urgency_level,
            'status' => $this->status,
            'created_at' => $this->created_at,
            'consultation_date' => optional($record?->date_recorded)->toDateString()
                ?: optional($this->created_at)->toDateString(),
            'reason_for_referral' => $pending['reason_for_referral'] ?? null,
            'chief_complaint' => $pending['chief_complaint'] ?? $record?->chief_complaint,
            'initial_diagnosis' => $pending['initial_diagnosis'] ?? $record?->diagnosis,
            'initial_action_taken' => $pending['initial_action_taken'] ?? $record?->treatment_notes,
            'pending_referral' => $pending,
            'referral_status' => 'Awaiting Doctor Availability',
            'submission_status' => 'Not Yet Submitted',
        ];
    }
}
