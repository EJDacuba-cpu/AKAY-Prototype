<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\User;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Validator;

/** Clinical TB authority is narrower than the configurable consultation duty. */
final class TbClinicalAuthority
{
    public function __construct(
        private readonly ClinicalRegistry $registry,
        private readonly FacilityAccessService $access,
    ) {}

    public static function canConfirm(?User $user): bool
    {
        return $user !== null && $user->isRhu() && $user->staff_role === 'doctor'
            && ActionPermissions::allows($user, 'conditions.confirm');
    }

    public static function ensurePhysician(User $user): void
    {
        abort_unless(self::canConfirm($user), 403, 'Only an RHU physician with condition-confirmation permission may confirm TB or authorize TB clinical decisions.');
        app(FacilityAccessService::class)->ensureValidFacilityAssignment($user);
    }

    /** Durable provenance for new assessments; account reassignment is not a clinical amendment. */
    public function finalizationAttestation(User $user, array $diagnoses): ?array
    {
        if (! self::canConfirm($user) || ! collect($diagnoses)->contains(fn ($entry) => $this->isTbName($entry['name'] ?? null))) {
            return null;
        }

        return ['physician_id' => $user->id, 'physician_name' => $user->name,
            'rural_health_unit_id' => $user->rural_health_unit_id, 'confirmed_at' => now()->toISOString(),
            'assessment_hash' => $this->assessmentFingerprint($diagnoses)];
    }

    public function attestationMatches(HealthRecord $record): bool
    {
        $signed = $record->tb_assessment_authority;

        return is_array($signed) && (int) ($signed['physician_id'] ?? 0) === (int) $record->finalized_by
            && (int) ($signed['rural_health_unit_id'] ?? 0) === (int) $record->rural_health_unit_id
            && filled($signed['confirmed_at'] ?? null)
            && hash_equals($this->assessmentFingerprint($record->diagnoses ?? []), (string) ($signed['assessment_hash'] ?? ''));
    }

    public function hasPhysicianFinalization(HealthRecord $record): bool
    {
        $finalizer = User::find($record->finalized_by);
        $legacy = $record->tb_assessment_authority === null && $finalizer
            && $finalizer->getRawOriginal('role') === 'rhu' && $finalizer->staff_role === 'doctor'
            && (int) $finalizer->getRawOriginal('rural_health_unit_id') === (int) $record->rural_health_unit_id;

        return $record->finalized_at !== null && ($this->attestationMatches($record) || $legacy);
    }

    private function assessmentFingerprint(array $diagnoses): string
    {
        // Fixed scalar slots avoid depending on JSON object-key ordering.
        $assessments = array_map(fn ($entry) => [$entry['name'] ?? '',
            $entry['tbManagement']['diagnosisType'] ?? '', $entry['tbManagement']['drugResistance'] ?? ''], $diagnoses);

        return hash('sha256', json_encode($assessments, JSON_THROW_ON_ERROR));
    }

    public function isTbName(?string $name): bool
    {
        return ($this->registry->matchCondition($name)['key'] ?? null) === 'tuberculosis'
            || preg_match('/\b(?:TB|PTB|LTBI|tuberculosis|tuberculous)\b/iu', (string) $name) === 1;
    }

    /**
     * Continuing TB Disease care (Active/Controlled), not provisional under-evaluation.
     */
    public function hasContinuingTbDiseaseCondition(Patient $patient): bool
    {
        return PatientCondition::query()
            ->where('patient_id', $patient->id)
            ->where('condition_identity', 'tuberculosis')
            ->whereIn('status', PatientCondition::MONITORABLE_STATUSES)
            ->exists();
    }

    /**
     * Latest physician-confirmed TB Disease from an authoritative finalized record.
     * Active Condition alone is not sufficient.
     *
     * @return array{diagnosisType: string, drugResistance: string, tbCaseNumber: string, source_record_id: int}|null
     */
    public function latestPhysicianConfirmedTbDisease(Patient $patient): ?array
    {
        $records = HealthRecord::query()
            ->where('patient_id', $patient->id)
            ->whereNotNull('finalized_at')
            ->orderByDesc('date_recorded')
            ->orderByDesc('id')
            ->get(['id', 'diagnoses', 'tb_assessment_authority', 'finalized_at', 'finalized_by', 'rural_health_unit_id']);

        foreach ($records as $record) {
            if (! $this->hasPhysicianFinalization($record)) {
                continue;
            }
            foreach ($record->diagnoses ?? [] as $entry) {
                if (! is_array($entry) || ! $this->isTbName($entry['name'] ?? null)) {
                    continue;
                }
                $type = $entry['tbManagement']['diagnosisType'] ?? null;
                if ($type !== 'tb_disease') {
                    continue;
                }

                return [
                    'diagnosisType' => 'tb_disease',
                    'drugResistance' => (string) ($entry['tbManagement']['drugResistance'] ?? ''),
                    'tbCaseNumber' => (string) ($entry['tbManagement']['tbCaseNumber'] ?? ''),
                    'source_record_id' => (int) $record->id,
                ];
            }
        }

        return null;
    }

    /**
     * Ordinary follow-up / new consultation cannot downgrade a continuing
     * physician-confirmed TB Disease assessment. Susceptibility remains editable.
     */
    public function enforceFollowUpAssessmentLock(Validator $validator, Patient $patient, array $diagnoses): void
    {
        if (! $this->hasContinuingTbDiseaseCondition($patient)) {
            return;
        }
        $prior = $this->latestPhysicianConfirmedTbDisease($patient);
        if ($prior === null) {
            return;
        }

        foreach ($diagnoses as $index => $entry) {
            if (! is_array($entry) || ! $this->isTbName($entry['name'] ?? null)) {
                continue;
            }
            $type = $entry['tbManagement']['diagnosisType'] ?? null;
            if ($type === 'tb_disease') {
                continue;
            }
            $validator->errors()->add(
                "diagnoses.$index.tbManagement.diagnosisType",
                'TB Disease was confirmed in a previous consultation. This assessment cannot be changed during follow-up.'
            );
        }
    }

    /** Narrative diagnoses may qualify TB or combine it with another diagnosis. */
    public function ensureDiagnosisText(User $user, ?string $text): void
    {
        if ($this->isTbName($text)) {
            self::ensurePhysician($user);
        }
    }

    public function authorizeRecord(User $user, Patient $patient, array $data): void
    {
        foreach ($data['diagnoses'] ?? [] as $index => $entry) {
            $isTb = $this->isTbName($entry['name'] ?? null);
            $assessment = self::compact($entry['tbManagement'] ?? []);
            if ($assessment !== [] || ($isTb && ($user->isRhu() || ! empty($entry['activate'])))) {
                self::ensurePhysician($user);
            }
            if ($assessment !== [] && ! $isTb) {
                throw ValidationException::withMessages(["diagnoses.$index.tbManagement" => 'TB assessment belongs to a recognized TB diagnosis.']);
            }
        }
        if ($user->isRhu()) {
            $this->ensureDiagnosisText($user, $data['diagnosis'] ?? null);
        }

        $card = $data['tb_data'] ?? null;
        if (! is_array($card)) {
            return;
        }
        $clinical = self::clinicalSnapshot($card);
        if ($clinical === []) {
            return;
        }
        // Transitional compatibility: a new visit may carry an immutable,
        // authorized historical snapshot, but cannot create/change clinical
        // card fields. Registration/clinical changes belong to the separate
        // case endpoints introduced in subsequent increments.
        $records = $this->access->scopePatientHealthRecords(HealthRecord::query(), $user)
            ->where('patient_id', $patient->id)->whereNotNull('tb_data')->select(['id', 'tb_data']);
        foreach ($records->cursor() as $record) {
            if (self::clinicalSnapshot($record->tb_data) === $clinical) {
                return;
            }
        }
        self::ensurePhysician($user);
        throw ValidationException::withMessages([
            'tb_data' => 'Clinical TB card fields cannot be created or changed in a consultation. Existing treatment cases remain read-only via TB case management.',
        ]);
    }

    private static function clinicalSnapshot(array $card): array
    {
        unset($card['doseCalendar'], $card['adverseEvents']);

        return self::compact($card);
    }

    /** Ignore empty form defaults and key ordering when comparing snapshots. */
    private static function compact(array $value): array
    {
        $result = [];
        foreach ($value as $key => $item) {
            $item = is_array($item) ? self::compact($item) : $item;
            if ($item !== null && $item !== '' && $item !== false && $item !== []) {
                $result[$key] = $item;
            }
        }
        ksort($result);

        return $result;
    }
}
