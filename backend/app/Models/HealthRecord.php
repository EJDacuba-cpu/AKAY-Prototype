<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class HealthRecord extends Model
{
    protected $fillable = [
        'idempotency_key',
        'idempotency_hash',
        'patient_id',
        'created_by',
        'barangay_health_center_id',
        'rural_health_unit_id',
        'date_recorded',
        'vital_signs',
        'visit_type',
        'parent_health_record_id',
        'category',
        'maternal_data',
        'immunization_data',
        'monitoring_data',
        'family_planning_data',
        'tb_data',
        'needs_referral',
        'chief_complaint',
        'diagnosis',
        'treatment_notes',
        'medical_history',
        'notes',
    ];

    protected $hidden = [
        'idempotency_key',
        'idempotency_hash',
    ];

    protected $appends = [
        'outcome',
        'outcome_sub_label',
    ];

    protected $casts = [
        'date_recorded' => 'datetime',
        'vital_signs' => 'array',
        'maternal_data' => 'array',
        'immunization_data' => 'array',
        'monitoring_data' => 'array',
        'family_planning_data' => 'array',
        'tb_data' => 'array',
        'needs_referral' => 'boolean',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function parentRecord(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_health_record_id');
    }

    public function followUpTask(): HasOne
    {
        return $this->hasOne(FollowUpTask::class);
    }

    public function completedFollowUpTask(): HasOne
    {
        return $this->hasOne(FollowUpTask::class, 'fulfilled_by_health_record_id');
    }

    public function childRecords(): HasMany
    {
        return $this->hasMany(self::class, 'parent_health_record_id');
    }

    public function dispensedMedicines(): HasMany
    {
        return $this->hasMany(HealthRecordMedicine::class);
    }

    public function referrals(): HasMany
    {
        return $this->hasMany(Referral::class);
    }

    /**
     * DOC-14 holds recorded against this record - a referral the BHW tried to
     * send while the receiving RHU had no available provider. The referral row
     * itself was never created, so this is the only trace of the attempt.
     */
    public function referralHolds(): HasMany
    {
        return $this->hasMany(ReferralHold::class);
    }

    /**
     * Deliberately a second relation over the same foreign key as referrals().
     *
     * show() eager loads `referrals` through FacilityAccessService's scope, so
     * that relation holds only the referrals the *viewer* may see. Deriving the
     * outcome from it would make the same record read "Referred" for one role
     * and "Routine" for another. This relation is never scoped.
     */
    public function outcomeReferrals(): HasMany
    {
        return $this->hasMany(Referral::class, 'health_record_id');
    }

    /**
     * Relations the derived outcome reads. Callers listing records MUST eager
     * load these; the accessors fall back to a query per record otherwise.
     */
    public const OUTCOME_RELATIONS = [
        'outcomeReferrals:id,health_record_id,status',
        'followUpTask:id,health_record_id,state,due_date',
        'referralHolds:id,health_record_id,status',
    ];

    /**
     * Resolved disposition for the records list badge.
     *
     * Precedence is Referred > Follow-up > Routine and is deliberately derived
     * rather than stored: a referral can be accepted and a follow-up task can be
     * fulfilled or cancelled long after the record row is written, so any column
     * holding this would be stale the moment the workflow moved on.
     */
    public function getOutcomeAttribute(): string
    {
        if ($this->hasReferralDisposition()) {
            return 'Referred';
        }

        if ($this->hasActiveFollowUp()) {
            return 'Follow-up';
        }

        return 'Routine';
    }

    /**
     * Secondary line under the badge. Only DOC-14 has one today: the referral
     * never reached the RHU because no provider was available.
     */
    public function getOutcomeSubLabelAttribute(): ?string
    {
        if (! $this->hasReferralDisposition()) {
            return null;
        }

        $holds = $this->relationLoaded('referralHolds')
            ? $this->getRelation('referralHolds')
            : $this->referralHolds()->get();

        foreach ($holds as $hold) {
            if ($hold->status === ReferralHold::STATUS_WAITING) {
                return 'Awaiting Provider';
            }
        }

        return null;
    }

    private function hasReferralDisposition(): bool
    {
        if ($this->needs_referral) {
            return true;
        }

        $referrals = $this->relationLoaded('outcomeReferrals')
            ? $this->getRelation('outcomeReferrals')
            : $this->outcomeReferrals()->get();

        return $referrals->isNotEmpty();
    }

    private function hasActiveFollowUp(): bool
    {
        $task = $this->relationLoaded('followUpTask')
            ? $this->getRelation('followUpTask')
            : $this->followUpTask()->first();

        return $task !== null
            && in_array($task->state, FollowUpTask::ACTIVE_STATES, true);
    }
}
