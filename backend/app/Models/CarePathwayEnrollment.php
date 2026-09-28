<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A patient's enrollment in one configured Care Pathway. See
 * docs/superpowers/specs/2026-09-28-care-pathway-architecture-design.md and
 * config/care_pathways.php for what `pathway_key` may be.
 */
class CarePathwayEnrollment extends Model
{
    public const STATUS_ACTIVE = 'active';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_DISCONTINUED = 'discontinued';

    protected $fillable = [
        'patient_id', 'pathway_key', 'status', 'barangay_health_center_id',
        'started_health_record_id', 'started_at', 'ended_health_record_id',
        'ended_at', 'end_reason', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function conditions(): HasMany
    {
        return $this->hasMany(CarePathwayEnrollmentCondition::class, 'enrollment_id');
    }

    public function encounters(): HasMany
    {
        return $this->hasMany(CarePathwayEncounter::class, 'enrollment_id');
    }

    public function startedHealthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class, 'started_health_record_id');
    }

    public function followUpTasks(): BelongsToMany
    {
        return $this->belongsToMany(FollowUpTask::class, 'care_pathway_enrollment_follow_up_task', 'enrollment_id', 'follow_up_task_id');
    }

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    /** Condition names currently part of this enrollment (not soft-removed). */
    public function activeConditionNames(): array
    {
        return $this->conditions
            ->filter(fn (CarePathwayEnrollmentCondition $condition) => $condition->isActive())
            ->pluck('condition_name')
            ->all();
    }
}
