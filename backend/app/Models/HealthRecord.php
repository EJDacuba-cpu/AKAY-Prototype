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
        'consultation_uuid',
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
        'tb_assessment_authority',
        'needs_referral',
        'chief_complaint',
        'physical_exam',
        'history_of_present_illness',
        'body_findings',
        'diagnosis',
        'diagnoses',
        'assessment_notes',
        'treatment_notes',
        'medical_history',
        'background_changes',
        'informant',
        'similar_illness',
        'history_snapshot',
        'notes',
        'encoded_by', 'assessed_by', 'finalized_by', 'finalized_at', 'items_planned',
    ];

    // Internal identity, never part of a clinical response. consultation_uuid
    // is hidden for the same reason as the idempotency fields: it is written by
    // the client and read by the draft pipeline, not by record consumers.
    /** Who gave the history for this visit (ITR "Informant"). */
    public const INFORMANT_RELATIONS = [
        'Patient', 'Mother', 'Father', 'Spouse', 'Guardian', 'Grandparent', 'Sibling', 'Other',
    ];

    /** Whether others in the household had a similar illness (ITR "Similar illness"). */
    public const SIMILAR_ILLNESS_ANSWERS = ['Yes', 'No', 'Unknown'];

    /**
     * Regions of the consultation's front-facing 2D body preview. A body
     * finding records where a symptom was noted - documentation, not diagnosis.
     */
    public const BODY_REGIONS = [
        'head', 'chest', 'abdomen', 'pelvis',
        'right_arm', 'left_arm', 'right_hand', 'left_hand',
        'right_leg', 'left_leg', 'right_foot', 'left_foot',
    ];

    /**
     * The report a diagnosis may be included in (diagnoses.*.reportAs). One
     * choice per diagnosis; null means it is not reported. The visit-level
     * monitoring_data.morbidityReportingStatus is derived from these on save
     * (HealthRecordController::normalizeDiagnosisReporting).
     */
    public const DIAGNOSIS_REPORT_TYPES = ['morbidity', 'notifiable'];

    /**
     * monitoring_data.consultationWorkflow value of a simplified BHC General
     * Consultation, whose diagnoses[] are health-concern entries with optional
     * reporting destinations (App\Services\ReportingEntries).
     */
    public const WORKFLOW_BHC_GENERAL_V2 = 'bhc_general_v2';

    /**
     * monitoring_data.consultationWorkflow value of the RHU ITR consultation.
     * Nurse/encode fills assessment; doctor/finalize diagnoses, activates
     * conditions, prescribes and schedules RHU follow-up.
     */
    public const WORKFLOW_RHU_ITR_V1 = 'rhu_itr_v1';

    protected $hidden = [
        'idempotency_key',
        'idempotency_hash',
        'consultation_uuid',
        // Clinical history: served only by the background-history endpoint,
        // which checks clinical.history - never part of a record response.
        'background_changes',
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
        'tb_assessment_authority' => 'array',
        'body_findings' => 'array',
        'diagnoses' => 'array',
        'background_changes' => 'array',
        'informant' => 'array',
        'similar_illness' => 'array',
        'history_snapshot' => 'array',
        'needs_referral' => 'boolean',
        'items_planned' => 'array',
        'finalized_at' => 'datetime',
    ];

    public function isBhcGeneralV2(): bool
    {
        return ($this->monitoring_data['consultationWorkflow'] ?? null) === self::WORKFLOW_BHC_GENERAL_V2;
    }

    public function isRhuItrV1(): bool
    {
        return ($this->monitoring_data['consultationWorkflow'] ?? null) === self::WORKFLOW_RHU_ITR_V1;
    }

    /**
     * Fields an RHU may see on a referral slip for a linked BHC visit.
     * Full Clinic Ledger details stay owned by the recording facility.
     *
     * @return array<string, mixed>
     */
    public function toReferralSlipClinicalArray(): array
    {
        return [
            'id' => $this->id,
            'chief_complaint' => $this->chief_complaint,
            'history_of_present_illness' => $this->history_of_present_illness,
            'physical_exam' => $this->physical_exam,
            'body_findings' => $this->body_findings,
            'vital_signs' => $this->vital_signs,
            'treatment_notes' => $this->treatment_notes,
        ];
    }

    public function prescriptionDisplayText(): string
    {
        $structured = $this->structuredPrescriptionSummaries();
        if ($structured !== []) {
            return implode("\n", array_column($structured, 'line'));
        }

        $text = trim((string) ($this->monitoring_data['prescriptionText'] ?? ''));
        if ($text !== '') {
            return $text;
        }

        $lines = $this->monitoring_data['prescribedMedicines'] ?? [];
        if (! is_array($lines)) {
            return '';
        }

        $parts = [];
        foreach ($lines as $line) {
            if (! is_array($line)) {
                continue;
            }
            $name = trim((string) ($line['name'] ?? $line['medicineName'] ?? ''));
            $quantity = trim((string) ($line['quantity'] ?? ''));
            $unit = trim((string) ($line['unit'] ?? ''));
            $instructions = trim((string) ($line['instructions'] ?? ''));
            $qty = trim($quantity.($unit !== '' ? ' '.$unit : ''));
            $chunk = implode(' · ', array_values(array_filter([$name, $qty, $instructions], fn ($value) => $value !== '')));
            if ($chunk !== '') {
                $parts[] = $chunk;
            }
        }

        return implode("\n", $parts);
    }

    /**
     * Medicine-only summaries for dispensing staff (no diagnosis / TB assessment chrome).
     *
     * @return list<array<string, mixed>>
     */
    public function structuredPrescriptionSummaries(): array
    {
        $orders = $this->monitoring_data['prescriptions'] ?? [];
        if (! is_array($orders)) {
            return [];
        }

        $summaries = [];
        foreach ($orders as $order) {
            if (! is_array($order)) {
                continue;
            }
            $medicineName = trim((string) ($order['medicineName'] ?? ''));
            if ($medicineName === '') {
                continue;
            }
            $strength = trim((string) ($order['strength'] ?? ''));
            $dose = trim((string) ($order['dose'] ?? ''));
            $route = trim((string) ($order['route'] ?? ''));
            $frequency = trim((string) ($order['frequency'] ?? ''));
            $duration = trim((string) ($order['duration'] ?? ''));
            $instructions = trim((string) ($order['instructions'] ?? ''));
            $authorizedQuantity = $order['authorizedQuantity'] ?? null;
            $authorizedUnit = trim((string) ($order['authorizedUnit'] ?? ''));
            $qtyParts = [];
            if (is_int($authorizedQuantity) || (is_string($authorizedQuantity) && ctype_digit($authorizedQuantity))) {
                $qtyParts[] = (string) $authorizedQuantity;
            }
            if ($authorizedUnit !== '') {
                $qtyParts[] = $authorizedUnit;
            }
            $authorized = trim(implode(' ', $qtyParts));
            $line = implode(' · ', array_values(array_filter([
                trim($medicineName.($strength !== '' ? ' '.$strength : '')),
                $dose,
                $route,
                $frequency,
                $duration,
                $instructions,
                $authorized,
            ], fn ($value) => $value !== '')));

            $summaries[] = [
                'id' => (string) ($order['id'] ?? ''),
                'medicineName' => $medicineName,
                'strength' => $strength,
                'dose' => $dose,
                'route' => $route,
                'frequency' => $frequency,
                'duration' => $duration,
                'instructions' => $instructions,
                'authorizedQuantity' => is_numeric($authorizedQuantity) ? (int) $authorizedQuantity : null,
                'authorizedUnit' => $authorizedUnit,
                'line' => $line,
            ];
        }

        return $summaries;
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function tbTreatmentCase(): HasOne
    {
        return $this->hasOne(TbTreatmentCase::class, 'source_health_record_id');
    }

    public function laboratoryTests(): HasMany
    {
        return $this->hasMany(LaboratoryTest::class);
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

        if ($referrals->isNotEmpty()) {
            return true;
        }

        // Decision 3: a referral blocked at submission (DOC-14) never created a
        // referrals row - the only trace of the attempt is a waiting hold. That
        // still counts as "Referred" (rendered with the Awaiting Provider
        // sub-label below), not "Follow-up"/"Routine".
        $holds = $this->relationLoaded('referralHolds')
            ? $this->getRelation('referralHolds')
            : $this->referralHolds()->get();

        foreach ($holds as $hold) {
            if ($hold->status === ReferralHold::STATUS_WAITING) {
                return true;
            }
        }

        return false;
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
