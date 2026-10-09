<?php

namespace App\Services;

use App\Models\ConditionMonitoring;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\PatientConditionEvent;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The one way a patient condition's clinical status is set - only by RHU
 * staff, from an RHU feedback or an RHU record. apply() runs inside the
 * caller's transaction. Per
 * docs/superpowers/specs/2026-10-05-clinical-boundary-condition-confirmation-design.md.
 */
class PatientConditions
{
    public function __construct(private readonly ClinicalRegistry $clinicalRegistry) {}

    /** The working role must be RHU: the permission alone is not enough while on duty at a BHC. */
    public static function canConfirm(?User $user): bool
    {
        return $user !== null
            && ActionPermissions::allows($user, 'conditions.confirm')
            && $user->workflowRole() === User::ROLE_RHU_STAFF;
    }

    public static function rules(string $prefix = 'condition_confirmations'): array
    {
        return [
            $prefix => ['nullable', 'array', 'max:20'],
            "{$prefix}.*.condition_id" => ['nullable', 'integer'],
            "{$prefix}.*.name" => ["required_without:{$prefix}.*.condition_id", 'nullable', 'string', 'max:150', 'regex:/\S/'],
            "{$prefix}.*.status" => ['required', Rule::in(PatientCondition::STATUSES)],
            "{$prefix}.*.note" => ['nullable', 'string', 'max:500'],
            "{$prefix}.*.recommend_bhc_monitoring" => ['nullable', 'boolean'],
        ];
    }

    /**
     * Sets the status of each confirmed condition and returns every condition
     * it set (created or updated). All entries are checked before any write.
     *
     * @param  array<int, array<string, mixed>>  $confirmations validated by rules()
     * @return Collection<int, PatientCondition>
     */
    public function apply(Patient $patient, array $confirmations, User $user, string $sourceType, int $sourceId, string $prefix = 'condition_confirmations'): Collection
    {
        Patient::query()->whereKey($patient->id)->lockForUpdate()->firstOrFail();

        $resolved = [];
        $seen = [];
        foreach (array_values($confirmations) as $i => $entry) {
            $existing = null;
            if (($entry['condition_id'] ?? null) !== null) {
                $existing = PatientCondition::query()->where('patient_id', $patient->id)->find($entry['condition_id']);
                if ($existing === null) {
                    throw ValidationException::withMessages(["{$prefix}.{$i}.condition_id" => 'This condition does not belong to the patient.']);
                }
                $name = $existing->condition_name;
                $identity = $existing->condition_identity;
            } else {
                $name = trim((string) ($entry['name'] ?? ''));
                $match = $this->clinicalRegistry->matchCondition($name);
                $identity = $this->clinicalRegistry->conditionIdentity($match['key'] ?? null, $name);
            }

            if (isset($seen[$identity])) {
                throw ValidationException::withMessages(["{$prefix}.{$i}.name" => 'This condition is listed twice.']);
            }
            $seen[$identity] = true;

            $recommend = (bool) ($entry['recommend_bhc_monitoring'] ?? false);
            if ($recommend && ! in_array($entry['status'], PatientCondition::MONITORABLE_STATUSES, true)) {
                throw ValidationException::withMessages(["{$prefix}.{$i}.recommend_bhc_monitoring" => 'Only an Active or Controlled condition can be recommended for BHC monitoring.']);
            }

            $note = trim((string) ($entry['note'] ?? ''));
            $resolved[] = [
                'existing' => $existing,
                'name' => $name,
                'identity' => $identity,
                'status' => $entry['status'],
                'note' => $note === '' ? null : $note,
                'recommend' => $recommend,
            ];
        }

        $changed = new Collection;
        foreach ($resolved as $item) {
            $changed->push($this->set($patient, $item, $user, $sourceType, $sourceId));
        }

        return $changed;
    }

    private function set(Patient $patient, array $item, User $user, string $sourceType, int $sourceId): PatientCondition
    {
        $now = now();
        $status = $item['status'];

        $condition = PatientCondition::query()->where('patient_id', $patient->id)
            ->where('condition_identity', $item['identity'])->open()->first();
        // A resolved or ruled-out condition moving between those two stays one row.
        if ($condition === null && $item['existing'] !== null && ! in_array($status, PatientCondition::OPEN_STATUSES, true)) {
            $condition = $item['existing'];
        }

        $from = $condition?->status;
        $stamp = [
            'status' => $status,
            'confirmed_by' => $user->id,
            'confirmed_at' => $now,
            'source_type' => $sourceType,
            'source_id' => $sourceId,
            'updated_by' => $user->id,
        ];
        // The recommendation always follows what the RHU sent: ticked sets it,
        // anything else (including leaving Active/Controlled) clears it. A
        // condition BHC already monitors needs no recommendation.
        $alreadyMonitored = ConditionMonitoring::query()->where('patient_id', $patient->id)
            ->where('condition_identity', $item['identity'])
            ->where('status', ConditionMonitoring::STATUS_ACTIVE)
            ->exists();
        $recommended = $item['recommend'] && ! $alreadyMonitored;
        $stamp += [
            'bhc_monitoring_recommended_at' => $recommended ? $now : null,
            'bhc_monitoring_recommended_by' => $recommended ? $user->id : null,
        ];

        if ($condition === null) {
            $condition = PatientCondition::create($stamp + [
                'patient_id' => $patient->id,
                'condition_name' => $item['name'],
                'condition_identity' => $item['identity'],
                'created_by' => $user->id,
            ]);
        } else {
            $condition->update($stamp);
        }

        if ($from !== $status || $item['note'] !== null) {
            PatientConditionEvent::create([
                'patient_condition_id' => $condition->id,
                'from_status' => $from,
                'to_status' => $status,
                'note' => $item['note'],
                'source_type' => $sourceType,
                'source_id' => $sourceId,
                'changed_by' => $user->id,
                'changed_at' => $now,
            ]);
        }

        if (in_array($status, PatientCondition::MONITORABLE_STATUSES, true)) {
            ConditionMonitoring::query()->where('patient_id', $patient->id)
                ->where('condition_identity', $item['identity'])
                ->where('status', ConditionMonitoring::STATUS_ACTIVE)
                ->whereNull('patient_condition_id')
                ->update(['patient_condition_id' => $condition->id]);
        }

        return $condition;
    }
}
