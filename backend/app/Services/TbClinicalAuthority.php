<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Validation\ValidationException;

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

    public function isTbName(?string $name): bool
    {
        return ($this->registry->matchCondition($name)['key'] ?? null) === 'tuberculosis'
            || preg_match('/\b(?:TB|PTB|LTBI|tuberculosis|tuberculous)\b/iu', (string) $name) === 1;
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
            'tb_data' => 'Clinical TB card fields cannot be created or changed in a consultation. Form 4B registration is a separate action after finalization.',
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
