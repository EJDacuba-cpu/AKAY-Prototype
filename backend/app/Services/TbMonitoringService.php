<?php

namespace App\Services;

use App\Models\Patient;
use App\Models\TbMonitoringEntry;
use App\Models\TbMonitoringRevision;
use App\Models\TbTreatmentCase;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class TbMonitoringService
{
    public function readableCase(User $user, int $caseId): TbTreatmentCase
    {
        return app(TbCaseAccessService::class)->scope(TbTreatmentCase::query(), $user)->findOrFail($caseId);
    }

    public function context(User $user, TbTreatmentCase $case): array
    {
        $endorsement = $user->isBhc() ? $case->endorsements()->readableAtBhc((int) $user->barangay_health_center_id)
            ->where('status', 'accepted')->first() : null;
        $start = $this->startDate($case);

        return ['can_write' => $case->status === 'active' && $endorsement !== null && $start !== null
            && ActionPermissions::allows($user, 'consultations.encode'),
            'endorsement' => $endorsement ? ['id' => $endorsement->id, 'version' => $endorsement->version] : null,
            'start_date' => $start, 'today' => now('Asia/Manila')->toDateString()];
    }

    private function startDate(TbTreatmentCase $case): ?string
    {
        return $case->treatmentStartDate();
    }

    public function write(Request $request, int $caseId, array $data, ?int $entryId = null): array
    {
        $user = $request->user();
        abort_unless($user->isBhc(), 403, 'Daily observations are recorded by the accepted BHC treatment partner.');
        ActionPermissions::ensure($user, 'clinical.history');
        ActionPermissions::ensure($user, 'consultations.encode');
        app(FacilityAccessService::class)->ensureValidFacilityAssignment($user);
        $this->readableCase($user, $caseId);
        $values = ['dose_status' => $data['dose_status'],
            'weight_kg' => $data['weight_kg'] === null ? null : number_format((float) $data['weight_kg'], 2, '.', ''),
            'notes' => trim($data['notes'] ?? ''), 'voided' => (bool) ($data['voided'] ?? false)];
        $hash = hash('sha256', json_encode([$caseId, $entryId, $user->id, (int) $user->barangay_health_center_id,
            $data['endorsement_id'], $data['endorsement_version'], $data['observed_on'] ?? null,
            $data['version'] ?? null, trim($data['correction_reason'] ?? ''), $values], JSON_THROW_ON_ERROR));
        try {
            return DB::transaction(function () use ($request, $user, $caseId, $entryId, $data, $values, $hash) {
                $case = app(TbCaseAccessService::class)->scope(TbTreatmentCase::query(), $user)->whereKey($caseId)->lockForUpdate()->firstOrFail();
                $endorsement = $case->endorsements()->readableAtBhc((int) $user->barangay_health_center_id)->lockForUpdate()->firstOrFail();
                $patient = Patient::whereKey($endorsement->linked_patient_id)->lockForUpdate()->firstOrFail();
                abort_unless($patient->status === 'active' && (int) $patient->barangay_health_center_id === (int) $user->barangay_health_center_id, 404);
                app(FacilityAccessService::class)->ensureValidFacilityAssignment($user);
                abort_unless($case->status === 'active' && $endorsement->status === 'accepted', 409, 'An active case and accepted endorsement are required.');
                abort_unless((int) $endorsement->id === (int) $data['endorsement_id'] && $endorsement->version === (int) $data['endorsement_version'], 409, 'The treatment handoff changed. Refresh before recording.');
                if ($prior = TbMonitoringRevision::where('request_key', $data['request_key'])->first()) {
                    return $this->retry($prior, $hash);
                }
                $voided = $values['voided'];
                if ((! $voided && $values['dose_status'] === null && $values['weight_kg'] === null)
                    || ($voided && ($values['dose_status'] !== null || $values['weight_kg'] !== null))) {
                    throw ValidationException::withMessages(['dose_status' => 'Record a dose observation or weight; a void entry must clear both.']);
                }
                if (! $voided && $values['dose_status'] === 'on_hold' && $values['notes'] === '') {
                    throw ValidationException::withMessages(['notes' => 'Record the RHU instruction for holding medication.']);
                }
                if ($entryId !== null) {
                    $entry = $case->monitoringEntries()->whereKey($entryId)->lockForUpdate()->firstOrFail();
                    abort_unless((int) $entry->barangay_health_center_id === (int) $user->barangay_health_center_id, 403, 'Only the recording BHC can correct this observation.');
                    abort_unless($entry->version === (int) $data['version'], 409, 'This observation changed. Review its history before correcting.');
                    $entry->fill([...$values, 'version' => $entry->version + 1]);
                } else {
                    $start = $this->startDate($case);
                    if (! $start || $data['observed_on'] < $start || $data['observed_on'] > now('Asia/Manila')->toDateString()) {
                        throw ValidationException::withMessages(['observed_on' => 'Choose a date from the prescribed treatment start through today.']);
                    }
                    abort_if($case->monitoringEntries()->whereDate('observed_on', $data['observed_on'])->exists(), 409, 'An observation already exists for this date. Review or correct that entry.');
                    $entry = new TbMonitoringEntry([...$values, 'tb_treatment_case_id' => $case->id,
                        'observed_on' => $data['observed_on'], 'barangay_health_center_id' => $user->barangay_health_center_id, 'version' => 1]);
                }
                $entry->fill(['tb_case_endorsement_id' => $endorsement->id, 'recorded_by' => $user->id,
                    'recorder_name' => $user->name, 'recorded_at' => now()])->save();
                $entry->revisions()->create(['version' => $entry->version, 'values' => [...$values, 'observed_on' => $entry->observed_on->toDateString(),
                    'barangay_health_center_id' => $entry->barangay_health_center_id],
                    'reason' => $entryId ? trim($data['correction_reason']) : null,
                    'tb_case_endorsement_id' => $endorsement->id, 'recorded_by' => $user->id, 'recorder_name' => $user->name,
                    'recorded_at' => now(), 'request_key' => $data['request_key'], 'request_hash' => $hash]);
                $case->increment('version');
                app(AuditLogger::class)->log($request, $entryId ? 'updated' : 'created', 'tb_monitoring',
                    "Recorded observation {$entry->id} version {$entry->version} on TB case {$case->id}.");

                return ['entry' => $entry->fresh(), 'created' => $entryId === null];
            }, 3);
        } catch (QueryException $exception) {
            // A UUID reused concurrently on another case must be a conflict, not a 500.
            if ($prior = TbMonitoringRevision::where('request_key', $data['request_key'])->first()) {
                $this->readableCase($user, $caseId);

                return $this->retry($prior, $hash);
            }
            throw $exception;
        }
    }

    private function retry(TbMonitoringRevision $prior, string $hash): array
    {
        abort_unless(hash_equals($prior->request_hash, $hash), 409, 'This submission identity belongs to a different observation or correction.');

        return ['entry' => $prior->entry()->firstOrFail(), 'created' => false];
    }

    public function present(TbMonitoringEntry $entry, User $user, bool $canWrite): array
    {
        return [...Arr::except($entry->toArray(), ['revisions', 'barangay_health_center']),
            'facility_name' => $entry->barangayHealthCenter?->name,
            'can_correct' => $canWrite && $user->isBhc() && (int) $entry->barangay_health_center_id === (int) $user->barangay_health_center_id];
    }
}
