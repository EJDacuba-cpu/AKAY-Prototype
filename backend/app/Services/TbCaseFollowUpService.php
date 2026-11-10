<?php

namespace App\Services;

use App\Models\TbCaseClinicalEvent;
use App\Models\TbFollowUpLab;
use App\Models\TbTreatmentCase;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class TbCaseFollowUpService
{
    public function readableCase(User $user, int $id): TbTreatmentCase
    {
        return app(TbCaseAccessService::class)->scope(TbTreatmentCase::query(), $user)->findOrFail($id);
    }

    private function canPhysician(User $user, TbTreatmentCase $case): bool
    {
        return TbClinicalAuthority::canConfirm($user) && (int) $user->rural_health_unit_id === (int) $case->rural_health_unit_id
            && ActionPermissions::allows($user, 'consultations.finalize') && ActionPermissions::allows($user, 'clinical.history');
    }

    public function overview(User $user, int $id): array
    {
        $case = $this->readableCase($user, $id);
        $owner = $user->isRhu() && (int) $user->rural_health_unit_id === (int) $case->rural_health_unit_id;

        return ['case' => $case, 'case_version' => $case->version, 'start_date' => $case->treatmentStartDate(), 'today' => now('Asia/Manila')->toDateString(),
            'can_record_labs' => $owner && $case->status === 'active' && ActionPermissions::allows($user, 'records.correct'),
            'can_close' => $case->status === 'active' && $this->canPhysician($user, $case),
            'can_reopen' => $case->status === 'closed' && $this->canPhysician($user, $case),
            'labs' => $case->followUpLabs()->orderBy('id')->get(), 'events' => $case->clinicalEvents()->orderBy('id')->get()];
    }

    private function authorizeWrite(User $user, string $action): void
    {
        abort_unless($user->isRhu(), 403);
        ActionPermissions::ensure($user, 'clinical.history');
        app(FacilityAccessService::class)->ensureValidFacilityAssignment($user);
        if ($action === 'lab') {
            ActionPermissions::ensure($user, 'records.correct');
        } else {
            TbClinicalAuthority::ensurePhysician($user);
            ActionPermissions::ensure($user, 'consultations.finalize');
        }
    }

    public function write(Request $request, int $caseId, string $action, array $data, ?int $labId = null): array
    {
        $this->authorizeWrite($request->user(), $action);
        $this->readableCase($request->user(), $caseId);
        $hash = hash('sha256', json_encode([$caseId, $action, $labId, $request->user()->id, Arr::except($data, ['request_key'])], JSON_THROW_ON_ERROR));
        try {
            return DB::transaction(function () use ($request, $caseId, $action, $data, $labId, $hash) {
                $case = app(TbCaseAccessService::class)->scope(TbTreatmentCase::query(), $request->user())->whereKey($caseId)->lockForUpdate()->firstOrFail();
                $this->authorizeWrite($request->user(), $action);
                if ($prior = TbCaseClinicalEvent::where('request_key', $data['request_key'])->first()) {
                    return $this->retry($request->user(), $prior, $hash);
                }
                $lab = null;
                if ($action === 'lab') {
                    abort_unless($case->status === 'active', 409, 'Reopen the case with the RHU physician before changing follow-up laboratories.');
                    $lab = $this->saveLab($request, $case, $data, $labId);
                    $case->increment('version');
                    $snapshot = $lab->fresh()->toArray();
                    $kind = 'lab_saved';
                    $note = $data['correction_reason'] ?? 'Recorded RHU follow-up laboratory entry.';
                } else {
                    abort_unless($case->version === (int) $data['case_version'], 409, 'The case or evidence changed. Refresh and review before making this decision.');
                    $note = $data['note'];
                    if ($action === 'close') {
                        abort_unless($case->status === 'active', 409, 'This case is already closed.');
                        $snapshot = $this->closeCase($request, $case, $data);
                        $kind = 'closed';
                    } else {
                        abort_unless($case->status === 'closed', 409, 'Only a closed case can be reopened.');
                        TbCaseEndorsementService::lockIdentityPatients((int) $case->patient_id);
                        abort_if(TbCaseEndorsementService::hasActiveLinkedCase((int) $case->patient_id, (int) $case->id), 409, 'Another active case exists for this linked patient identity. Reconcile the episodes before reopening.');
                        $snapshot = Arr::only($case->toArray(), ['outcome_status', 'outcome_on', 'outcome_note', 'closed_by', 'closed_name', 'closed_at']);
                        $case->update(['status' => 'active', 'outcome_status' => null, 'outcome_on' => null, 'outcome_note' => null,
                            'closed_by' => null, 'closed_name' => null, 'closed_at' => null, 'version' => $case->version + 1]);
                        $kind = 'reopened';
                    }
                }
                $event = $case->clinicalEvents()->create(['tb_follow_up_lab_id' => $lab?->id, 'kind' => $kind, 'case_version' => $case->version,
                    'snapshot' => $snapshot, 'note' => $note, 'recorded_by' => $request->user()->id, 'recorder_name' => $request->user()->name,
                    'recorded_at' => now(), 'request_key' => $data['request_key'], 'request_hash' => $hash]);
                app(AuditLogger::class)->log($request, 'updated', 'tb_case_clinical_events', "Recorded {$kind} for TB case {$case->id}, version {$case->version}.");

                return ['case' => $case->fresh(), 'lab' => $lab?->fresh(), 'event' => $event, 'created' => $action === 'lab' && $labId === null];
            }, 3);
        } catch (QueryException $exception) {
            if ($prior = TbCaseClinicalEvent::where('request_key', $data['request_key'])->first()) {
                return $this->retry($request->user(), $prior, $hash);
            }
            throw $exception;
        }
    }

    private function checkDate(TbTreatmentCase $case, ?string $date, string $field, bool $future = false): void
    {
        $start = $case->treatmentStartDate();
        if (! $start || ($date !== null && ($date < $start || (! $future && $date > now('Asia/Manila')->toDateString())))) {
            throw ValidationException::withMessages([$field => 'Use a valid date from the prescribed start; observed dates cannot be in the future.']);
        }
    }

    private function saveLab(Request $request, TbTreatmentCase $case, array $data, ?int $id): TbFollowUpLab
    {
        $this->checkDate($case, $data['due_on'], 'due_on', true);
        foreach (['collection_on', 'examination_on'] as $field) {
            $this->checkDate($case, $data[$field] ?? null, $field);
        }
        $result = trim($data['result'] ?? '');
        if (($data['status'] === 'result_available' && ($result === '' || empty($data['examination_on'])))
            || ($data['status'] !== 'result_available' && $result !== '')) {
            throw ValidationException::withMessages(['result' => 'A completed result needs examination date and recorded result; other statuses must leave result blank.']);
        }
        if (! empty($data['collection_on']) && ! empty($data['examination_on']) && $data['collection_on'] > $data['examination_on']) {
            throw ValidationException::withMessages(['collection_on' => 'Collection cannot follow examination.']);
        }
        $lab = $id ? $case->followUpLabs()->whereKey($id)->lockForUpdate()->firstOrFail() : new TbFollowUpLab(['tb_treatment_case_id' => $case->id, 'version' => 0]);
        if ($id) {
            abort_unless($lab->version === (int) $data['version'], 409, 'A newer laboratory revision exists. Review it before changing this entry.');
        }
        $lab->fill([...Arr::only($data, ['milestone', 'test_name', 'due_on', 'status']), 'collection_on' => $data['collection_on'] ?? null,
            'examination_on' => $data['examination_on'] ?? null, 'result' => $result === '' ? null : $result, 'notes' => $data['notes'] ?? '',
            'version' => $lab->version + 1, 'recorded_by' => $request->user()->id, 'recorder_name' => $request->user()->name, 'recorded_at' => now()])->save();

        return $lab;
    }

    private function closeCase(Request $request, TbTreatmentCase $case, array $data): array
    {
        $this->checkDate($case, $data['outcome_on'], 'outcome_on');
        $labs = $case->followUpLabs()->orderBy('id')->lockForUpdate()->get();
        $ids = array_map('intval', $data['evidence_lab_ids']);
        $selected = $labs->filter(fn ($lab) => in_array((int) $lab->id, $ids, true) && $lab->status === 'result_available');
        if (count($ids) !== $selected->count() || ($data['outcome_status'] === 'cured' && $selected->isEmpty())) {
            throw ValidationException::withMessages(['evidence_lab_ids' => 'Select completed laboratory evidence from this case. Cured requires selected evidence and physician review.']);
        }
        $snapshot = ['outcome_status' => $data['outcome_status'], 'outcome_on' => $data['outcome_on'], 'note' => $data['note'],
            'evidence_labs' => $selected->values()->toArray(), 'lab_versions' => $labs->map(fn ($lab) => ['id' => $lab->id, 'version' => $lab->version])->all(),
            'monitoring_versions' => $case->monitoringEntries()->orderBy('id')->get(['id', 'observed_on', 'version', 'voided'])->toArray()];
        $case->update(['status' => 'closed', 'outcome_status' => $data['outcome_status'], 'outcome_on' => $data['outcome_on'], 'outcome_note' => $data['note'],
            'closed_by' => $request->user()->id, 'closed_name' => $request->user()->name, 'closed_at' => now(), 'version' => $case->version + 1]);

        return $snapshot;
    }

    private function retry(User $user, TbCaseClinicalEvent $prior, string $hash): array
    {
        abort_unless(hash_equals($prior->request_hash, $hash), 409, 'This submission identity is bound to another clinical command.');
        $case = $this->readableCase($user, (int) $prior->tb_treatment_case_id);

        return ['case' => $case, 'event' => $prior, 'lab' => $prior->tb_follow_up_lab_id ? $case->followUpLabs()->findOrFail($prior->tb_follow_up_lab_id) : null, 'created' => false];
    }
}
