<?php

namespace App\Services;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\TbCaseEndorsement;
use App\Models\TbTreatmentCase;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class TbCaseEndorsementService
{
    public function scope(User $user): Builder
    {
        abort_unless($user->isActive(), 403);
        app(FacilityAccessService::class)->ensureValidFacilityAssignment($user);
        $query = TbCaseEndorsement::query();
        if ($user->isAdmin()) {
            return $query;
        }
        ActionPermissions::ensure($user, 'clinical.history');
        if ($user->isRhu()) {
            return $query->whereHas('tbCase', fn ($case) => $case->where('rural_health_unit_id', $user->rural_health_unit_id));
        }
        if ($user->isBhc()) {
            return $query->where('receiving_bhc_id', $user->barangay_health_center_id);
        }

        return $query->whereRaw('1 = 0');
    }

    public function ownerCase(User $user, int $id, bool $write = false): TbTreatmentCase
    {
        if ($write) {
            TbClinicalAuthority::ensurePhysician($user);
            ActionPermissions::ensure($user, 'consultations.finalize');
            ActionPermissions::ensure($user, 'clinical.history');
        }
        $query = app(TbCaseAccessService::class)->scope(TbTreatmentCase::query(), $user);
        abort_unless($user->isRhu() || (! $write && $user->isAdmin()), 403);

        return $query->findOrFail($id);
    }

    public function canIssue(User $user): bool
    {
        // Still used for revoke on existing endorsements. New creates are retired
        // separately (canCreateEndorsement / create()).
        return TbClinicalAuthority::canConfirm($user) && ActionPermissions::allows($user, 'consultations.finalize')
            && ActionPermissions::allows($user, 'clinical.history');
    }

    /** New independent TB endorsement handoffs are retired in favor of manage_to_bhc. */
    public function canCreateEndorsement(User $user): bool
    {
        return false;
    }

    public function candidates(TbTreatmentCase $case): Builder
    {
        return BarangayHealthCenter::where('status', 'active')->where(fn ($query) => $query
            ->where('rural_health_unit_id', $case->rural_health_unit_id)
            ->when($case->patient->barangay_health_center_id, fn ($q, $id) => $q->orWhere('id', $id)));
    }

    public static function hasActiveLinkedCase(int $patientId, ?int $except = null): bool
    {
        return TbTreatmentCase::whereIn('patient_id', self::identityPatientIds($patientId))
            ->when($except, fn ($query) => $query->whereKeyNot($except))
            ->where('status', 'active')->exists();
    }

    /** Explicit identity attestations survive revocation and episode closure. */
    private static function identityPatientIds(int $patientId): array
    {
        $known = [$patientId => true];
        $frontier = [$patientId];
        while ($frontier !== []) {
            $edges = DB::table('tb_case_endorsements as endorsement')
                ->join('tb_treatment_cases as treatment', 'treatment.id', '=', 'endorsement.tb_treatment_case_id')
                ->whereNotNull('endorsement.linked_patient_id')
                ->where(fn ($query) => $query->whereIn('treatment.patient_id', $frontier)
                    ->orWhereIn('endorsement.linked_patient_id', $frontier))
                ->get(['treatment.patient_id', 'endorsement.linked_patient_id']);
            $frontier = [];
            foreach ($edges as $edge) {
                foreach ([(int) $edge->patient_id, (int) $edge->linked_patient_id] as $id) {
                    if (! isset($known[$id])) {
                        $known[$id] = true;
                        $frontier[] = $id;
                    }
                }
            }
        }
        $ids = array_keys($known);
        sort($ids, SORT_NUMERIC);

        return $ids;
    }

    /** Caller owns the transaction. Related aliases serialize competing writes. */
    public static function lockIdentityPatients(int $patientId): void
    {
        Patient::whereIn('id', self::identityPatientIds($patientId))->orderBy('id')->lockForUpdate()->get();
    }

    private function ensureSingleEpisode(Patient $patient, TbTreatmentCase $case): void
    {
        abort_if(TbTreatmentCase::where('patient_id', $patient->id)->where('status', 'active')->whereKeyNot($case->id)->exists()
            || self::hasActiveLinkedCase($patient->id, $case->id), 409, 'Another active TB case is already associated with this patient registration. Clinical reconciliation is required.');
    }

    public function create(Request $request, int $caseId, array $data): array
    {
        abort(410, 'TB treatment endorsements are no longer issued. Use Manage to BHC monitoring for continued BHC care.');
        $this->ownerCase($request->user(), $caseId, true);
        $hash = hash('sha256', json_encode([$caseId, (int) $data['case_version'], (int) $data['receiving_bhc_id'], $data['note']], JSON_THROW_ON_ERROR));
        $key = $data['request_key'];
        try {
            return DB::transaction(function () use ($request, $caseId, $data, $hash, $key) {
                $case = TbTreatmentCase::whereKey($caseId)->lockForUpdate()->firstOrFail();
                $this->ownerCase($request->user(), $caseId, true);
                if ($prior = TbCaseEndorsement::where('request_key', $key)->first()) {
                    return $this->creationRetry($prior, $caseId, $hash);
                }
                self::lockIdentityPatients((int) $case->patient_id);
                $patient = Patient::whereKey($case->patient_id)->firstOrFail();
                $case->setRelation('patient', $patient);
                // Validate the target even if an active request currently exists.
                $target = $this->candidates($case)->whereKey($data['receiving_bhc_id'])->first();
                if (! $target) {
                    throw ValidationException::withMessages(['receiving_bhc_id' => 'Choose an active catchment BHC or the patient\'s home BHC.']);
                }
                abort_unless($case->status === 'active', 422, 'Only active treatment cases can be endorsed.');
                abort_unless($case->version === (int) $data['case_version'], 409, 'The treatment case changed. Refresh before endorsing.');
                abort_if($case->endorsements()->whereIn('status', TbCaseEndorsement::ACTIVE_STATUSES)->exists(), 409, 'Revoke or resolve the current endorsement before assigning another BHC.');
                abort_unless($patient->status === 'active', 422, 'An inactive patient cannot be newly endorsed.');
                $same = (int) $patient->barangay_health_center_id === (int) $target->id;
                if ($same) {
                    $this->ensureSingleEpisode($patient, $case);
                }
                $row = TbCaseEndorsement::create([
                    'tb_treatment_case_id' => $case->id, 'receiving_bhc_id' => $target->id,
                    'linked_patient_id' => $same ? $patient->id : null,
                    'patient_snapshot' => self::identity($patient), 'note' => $data['note'],
                    'status' => $same ? 'pending_review' : 'linkage_needed', 'endorsed_by' => $request->user()->id,
                    'endorsed_at' => now(), 'request_key' => $key, 'request_hash' => $hash,
                ]);
                $case->increment('version');
                app(AuditLogger::class)->log($request, 'created', 'tb_case_endorsements', "Endorsed TB case {$case->id} to BHC {$target->id} (endorsement {$row->id}).");

                return ['endorsement' => $row->fresh(), 'created' => true];
            }, 3);
        } catch (QueryException $exception) {
            if ($prior = TbCaseEndorsement::where('request_key', $key)->first()) {
                return $this->creationRetry($prior, $caseId, $hash);
            }
            throw $exception;
        }
    }

    private function creationRetry(TbCaseEndorsement $row, int $caseId, string $hash): array
    {
        abort_unless((int) $row->tb_treatment_case_id === $caseId && hash_equals($row->request_hash, $hash), 409, 'This submission identity is already bound to another endorsement.');

        return ['endorsement' => $row, 'created' => false];
    }

    private function localPatient(User $user, ?int $id): Patient
    {
        if ($id !== null) {
            self::lockIdentityPatients($id);
        }
        $patient = Patient::whereKey($id)->lockForUpdate()->first();
        abort_unless($patient && (int) $patient->barangay_health_center_id === (int) $user->barangay_health_center_id, 403, FacilityAccessService::DENIED_MESSAGE);
        abort_unless($patient->status === 'active', 422, 'Choose an active registration at your BHC.');

        return $patient;
    }

    public function transition(Request $request, int $id, string $action, array $data): TbCaseEndorsement
    {
        $visible = $this->scope($request->user())->findOrFail($id);

        return DB::transaction(function () use ($request, $visible, $action, $data) {
            $user = $request->user();
            $case = TbTreatmentCase::whereKey($visible->tb_treatment_case_id)->lockForUpdate()->firstOrFail();
            $row = $this->scope($user)->whereKey($visible->id)->lockForUpdate()->firstOrFail();
            if ($action === 'revoke') {
                $this->ownerCase($user, $case->id, true);
            } else {
                abort_unless($user->isBhc() && (int) $row->receiving_bhc_id === (int) $user->barangay_health_center_id, 403);
                ActionPermissions::ensure($user, 'clinical.history');
                ActionPermissions::ensure($user, 'consultations.encode');
            }
            if (($action === 'revoke' && $row->status === 'revoked') || ($action === 'decline' && $row->status === 'declined')) {
                abort_unless($row->reason === $data['reason'], 409, 'The recorded decision cannot be overwritten.');

                return $row;
            }
            if (($action === 'accept' && $row->status === 'accepted') || ($action === 'link'
                && in_array($row->status, TbCaseEndorsement::READABLE_STATUSES, true) && (int) $row->linked_patient_id === (int) $data['linked_patient_id'])) {
                $this->localPatient($user, $row->linked_patient_id);

                return $row;
            }
            abort_unless($row->version === (int) $data['version'], 409, 'This endorsement changed. Refresh before acting.');
            $allowed = match ($action) {
                'link' => ['linkage_needed'], 'accept' => ['pending_review'],
                'decline' => ['linkage_needed', 'pending_review'], 'revoke' => TbCaseEndorsement::ACTIVE_STATUSES,
            };
            abort_unless(in_array($row->status, $allowed, true), 409, 'This endorsement no longer permits that action.');
            $changes = [];
            if ($action === 'link' || $action === 'accept') {
                abort_unless($case->status === 'active', 409, 'The treatment case is no longer active.');
                $local = $this->localPatient($user, $action === 'link' ? (int) $data['linked_patient_id'] : $row->linked_patient_id);
                $this->ensureSingleEpisode($local, $case);
                $changes = $action === 'link'
                    ? ['linked_patient_id' => $local->id, 'status' => 'pending_review', 'linked_by' => $user->id, 'linked_at' => now()]
                    : ['status' => 'accepted', 'reviewed_by' => $user->id, 'reviewed_at' => now()];
            } elseif ($action === 'decline') {
                $changes = ['status' => 'declined', 'reason' => $data['reason'], 'reviewed_by' => $user->id, 'reviewed_at' => now()];
            } else {
                abort_unless($case->version === (int) $data['case_version'], 409, 'The treatment case changed. Refresh before revoking.');
                $changes = ['status' => 'revoked', 'reason' => $data['reason'], 'revoked_by' => $user->id, 'revoked_at' => now()];
            }
            $row->update([...$changes, 'version' => $row->version + 1]);
            $case->increment('version');
            app(AuditLogger::class)->log($request, 'updated', 'tb_case_endorsements', "Recorded {$action} for TB endorsement {$row->id} (case {$case->id}).");

            return $row->fresh();
        }, 3);
    }

    public static function identity(Patient $patient): array
    {
        return Arr::only(PatientIdentity::response($patient, false), ['id', 'first_name', 'middle_name', 'last_name', 'full_name', 'birthdate', 'sex']);
    }
}
