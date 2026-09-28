<?php

namespace App\Services;

use App\Models\CarePathwayEncounter;
use App\Models\CarePathwayEnrollment;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Turns a validated "start/continue a Care Pathway" activation into
 * enrollment/condition/encounter rows. Called ONLY from
 * HealthRecordController::store(), inside its existing DB::transaction(),
 * right where CurrentConditionsSync::sync() already runs - same pattern,
 * same file, same transaction. Never a standalone write. Pathway/field-set
 * validity is read from ClinicalRegistry (config/clinical_registry.php),
 * the same unified registry the diagnosis and surveillance sync uses.
 */
class CarePathwayActivationService
{
    public function __construct(private readonly ClinicalRegistry $registry) {}

    public function canManage(User $user): bool
    {
        return $user->isAdmin() || ActionPermissions::allows($user, 'care_pathways.manage');
    }

    /**
     * Mirrors CurrentConditionsSync::assertAllowed exactly: a user who may
     * not manage Care Pathways may still save a consultation with none.
     */
    public function assertAllowed(User $user, array $activations): void
    {
        if ($this->canManage($user) || $activations === []) {
            return;
        }

        throw ValidationException::withMessages([
            'monitoring_data.activeCarePathways.0' => 'You do not have permission to start or continue a care pathway.',
        ]);
    }

    /**
     * @param array<int, array{pathway_key: string, conditions: array<int, array{condition_name: string, field_set_key: ?string, diagnosis_ref: ?string, field_values: array}>, link_legacy_health_record_ids?: array<int, int>, status?: ?string, end_reason?: ?string, remove_condition_names?: array<int, string>}> $activations
     */
    public function activate(Patient $patient, HealthRecord $record, array $activations, User $user): void
    {
        foreach ($activations as $index => $activation) {
            $this->activateOne($patient, $record, $activation, $user, $index);
        }
    }

    private function activateOne(Patient $patient, HealthRecord $record, array $activation, User $user, int $index): void
    {
        $pathwayKey = $activation['pathway_key'] ?? null;
        if (! is_string($pathwayKey) || ! $this->registry->isValidPathwayKey($pathwayKey)) {
            throw ValidationException::withMessages([
                "monitoring_data.activeCarePathways.$index.pathway_key" => 'This care pathway is not configured.',
            ]);
        }

        foreach ($activation['conditions'] ?? [] as $conditionIndex => $condition) {
            $fieldSetKey = $condition['field_set_key'] ?? null;
            if ($fieldSetKey !== null && ! $this->registry->pathwayHasFieldSet($pathwayKey, $fieldSetKey)) {
                throw ValidationException::withMessages([
                    "monitoring_data.activeCarePathways.$index.conditions.$conditionIndex.field_set_key" => 'This monitoring form is not configured for this pathway.',
                ]);
            }
        }

        $status = $activation['status'] ?? null;
        $isEnding = in_array($status, [CarePathwayEnrollment::STATUS_COMPLETED, CarePathwayEnrollment::STATUS_DISCONTINUED], true);

        $enrollment = CarePathwayEnrollment::query()
            ->where('patient_id', $patient->id)
            ->where('pathway_key', $pathwayKey)
            ->where('status', CarePathwayEnrollment::STATUS_ACTIVE)
            ->lockForUpdate()
            ->first();

        if ($enrollment === null && $isEnding) {
            throw ValidationException::withMessages([
                "monitoring_data.activeCarePathways.$index.status" => 'There is no active enrollment in this pathway to end.',
            ]);
        }

        $kind = CarePathwayEncounter::KIND_STARTED;
        if ($enrollment === null) {
            $enrollment = CarePathwayEnrollment::create([
                'patient_id' => $patient->id,
                'pathway_key' => $pathwayKey,
                'status' => CarePathwayEnrollment::STATUS_ACTIVE,
                'barangay_health_center_id' => $patient->barangay_health_center_id,
                'started_health_record_id' => $record->id,
                'started_at' => $record->date_recorded ?? now(),
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);
        } else {
            $kind = CarePathwayEncounter::KIND_CONTINUED;
        }

        foreach ($activation['remove_condition_names'] ?? [] as $conditionName) {
            $enrollment->conditions()
                ->where('condition_name', $conditionName)
                ->whereNull('removed_at')
                ->update(['removed_health_record_id' => $record->id, 'removed_at' => now()]);
        }

        $fieldData = [];
        foreach ($activation['conditions'] ?? [] as $condition) {
            $enrollment->conditions()->firstOrCreate(
                ['condition_name' => $condition['condition_name'], 'removed_at' => null],
                [
                    'field_set_key' => $condition['field_set_key'] ?? null,
                    'diagnosis_ref' => $condition['diagnosis_ref'] ?? null,
                    'added_health_record_id' => $record->id,
                ]
            );
            if (($condition['field_set_key'] ?? null) !== null && ($condition['field_values'] ?? []) !== []) {
                $fieldData[$condition['field_set_key']] = $condition['field_values'];
            }
        }

        if ($isEnding) {
            $enrollment->update([
                'status' => $status,
                'ended_health_record_id' => $record->id,
                'ended_at' => $record->date_recorded ?? now(),
                'end_reason' => $activation['end_reason'] ?? null,
                'updated_by' => $user->id,
            ]);
        }

        $enrollment->encounters()->create([
            'health_record_id' => $record->id,
            'kind' => $kind,
            'field_data' => $fieldData !== [] ? $fieldData : null,
            'created_at' => now(),
        ]);

        foreach ($activation['link_legacy_health_record_ids'] ?? [] as $legacyRecordId) {
            $enrollment->encounters()->firstOrCreate(
                ['health_record_id' => $legacyRecordId],
                ['kind' => CarePathwayEncounter::KIND_LEGACY_LINKED, 'field_data' => null, 'created_at' => now()]
            );
        }
    }
}
