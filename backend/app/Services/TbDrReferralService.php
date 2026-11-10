<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\LaboratoryTest;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\TbDrReferral;
use App\Models\TbDrReferralEvent;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class TbDrReferralService
{
    public const RESISTANCE_LABELS = ['rr_tb' => 'Bacteriologically-confirmed RR-TB', 'mdr_tb' => 'Bacteriologically-confirmed MDR-TB',
        'clinically_mdr_tb' => 'Clinically-diagnosed MDR-TB', 'xdr_tb' => 'Bacteriologically-confirmed XDR-TB', 'other' => 'Other Drug-resistant TB'];

    public function __construct(private readonly TbClinicalAuthority $authority) {}

    public function scope(User $user): Builder
    {
        abort_unless($user->isActive(), 403);
        app(FacilityAccessService::class)->ensureValidFacilityAssignment($user);
        if ($user->isAdmin()) {
            return TbDrReferral::query();
        }
        ActionPermissions::ensure($user, 'clinical.history');

        return $user->isRhu() ? TbDrReferral::where('rural_health_unit_id', $user->rural_health_unit_id) : TbDrReferral::whereRaw('1 = 0');
    }

    private function authorizeSource(User $user, HealthRecord $source): void
    {
        app(TbCaseRegistrationService::class)->authorizeRead($user, $source);
    }

    public function canAuthorize(User $user): bool
    {
        return TbClinicalAuthority::canConfirm($user) && ActionPermissions::allows($user, 'consultations.finalize')
            && ActionPermissions::allows($user, 'referrals.submit') && ActionPermissions::allows($user, 'clinical.history');
    }

    private function ensureWriter(User $user): void
    {
        TbClinicalAuthority::ensurePhysician($user);
        foreach (['consultations.finalize', 'referrals.submit', 'clinical.history'] as $duty) {
            ActionPermissions::ensure($user, $duty);
        }
    }

    private function patientSnapshot(Patient $patient): array
    {
        return Arr::only(PatientIdentity::response($patient, false), ['id', 'first_name', 'middle_name', 'last_name', 'full_name', 'birthdate',
            'sex', 'contact_number', 'street_address', 'purok_area', 'barangay', 'municipality']);
    }

    private function snapshot(HealthRecord $source): array
    {
        $diagnoses = array_values(array_filter($source->diagnoses ?? [], fn ($entry) => $this->authority->isTbName($entry['name'] ?? null)));
        $diagnosis = count($diagnoses) === 1 ? $diagnoses[0] : null;

        return ['source_health_record_id' => $source->id, 'diagnosis' => $diagnosis,
            'resistance_label' => self::RESISTANCE_LABELS[$diagnosis['tbManagement']['drugResistance'] ?? ''] ?? '',
            'date_recorded' => $source->date_recorded?->format('Y-m-d'), 'finalized_by' => $source->finalized_by,
            'finalized_at' => $source->finalized_at?->toISOString(), 'authority' => $source->tb_assessment_authority,
            'rhu_name' => RuralHealthUnit::find($source->rural_health_unit_id)?->name ?? '',
            'physician_name' => $source->tb_assessment_authority['physician_name'] ?? User::find($source->finalized_by)?->name ?? '',
            'laboratory_tests' => array_map(fn ($lab) => Arr::only($lab, ['id', 'recordId', 'testName', 'collectionDate', 'examinationDate', 'resultStatus', 'result', 'version']),
                app(LaboratoryEvidenceService::class)->present($source))];
    }

    private function reason(HealthRecord $source, array $snapshot): ?string
    {
        if (! $this->authority->hasPhysicianFinalization($source)) {
            return 'Finalize the TB assessment with an RHU physician before authorizing referral.';
        }
        $assessment = $snapshot['diagnosis']['tbManagement'] ?? [];
        if (($assessment['diagnosisType'] ?? '') !== 'tb_disease' || ! isset(self::RESISTANCE_LABELS[$assessment['drugResistance'] ?? ''])) {
            return 'A single finalized TB Disease assessment with a structured DR-TB classification is required.';
        }
        if ($source->patient->status !== 'active') {
            return 'An inactive patient cannot receive a new outbound referral.';
        }

        return null;
    }

    public function preview(User $user, HealthRecord $source): array
    {
        $this->authorizeSource($user, $source);
        $snapshot = $this->snapshot($source);
        $patient = $this->patientSnapshot($source->patient);
        $history = TbDrReferral::where('source_health_record_id', $source->id)->orderByDesc('id')->get();
        $last = $history->first();
        $current = $history->first(fn ($row) => $row->status !== 'cancelled');

        return ['eligible' => $this->reason($source, $snapshot) === null && ! $current,
            'reason' => $current ? 'An outbound referral already exists for this consultation.' : $this->reason($source, $snapshot),
            'source_revision' => hash('sha256', json_encode([$source->id, $source->patient_id, $source->rural_health_unit_id,
                $source->updated_at?->toISOString(), $source->diagnoses, $patient, $snapshot, $last ? [$last->id, $last->version] : null], JSON_THROW_ON_ERROR)),
            'can_authorize' => $this->canAuthorize($user), 'today' => now('Asia/Manila')->toDateString(),
            'patient_snapshot' => $patient, 'source_snapshot' => $snapshot,
            'current' => $current ? $this->present($user, $current) : null,
            'history' => $history->map(fn ($row) => $this->present($user, $row))->values()];
    }

    public function issue(Request $request, HealthRecord $source, array $data): array
    {
        $this->ensureWriter($request->user());
        $this->authorizeSource($request->user(), $source);
        $fields = ['destination_name' => trim($data['destination_name']), 'destination_address' => trim($data['destination_address'] ?? ''),
            'destination_contact' => trim($data['destination_contact'] ?? ''), 'reason' => trim($data['reason'])];
        $hash = hash('sha256', json_encode(['issue', $source->id, $request->user()->id, $data['source_revision'], $fields], JSON_THROW_ON_ERROR));
        try {
            return DB::transaction(function () use ($request, $source, $data, $fields, $hash) {
                $patient = Patient::whereKey($source->patient_id)->lockForUpdate()->firstOrFail();
                $record = HealthRecord::whereKey($source->id)->lockForUpdate()->firstOrFail();
                $this->authorizeSource($request->user(), $record);
                abort_unless((int) $record->patient_id === (int) $patient->id, 409, 'The source identity changed. Refresh the assessment.');
                $record->setRelation('patient', $patient);
                if ($prior = TbDrReferralEvent::where('request_key', $data['request_key'])->first()) {
                    return $this->retry($request->user(), $prior, $hash);
                }
                LaboratoryTest::where('health_record_id', $record->id)->orderBy('id')->lockForUpdate()->get();
                $preview = $this->preview($request->user(), $record);
                abort_unless(hash_equals($preview['source_revision'], $data['source_revision']), 409, 'Assessment, patient details, laboratory evidence or referral status changed. Refresh and review before authorizing.');
                abort_unless($preview['eligible'], $preview['current'] ? 409 : 422, $preview['reason'] ?? 'Referral is not eligible.');
                $row = TbDrReferral::create([...$fields, 'patient_id' => $record->patient_id, 'rural_health_unit_id' => $record->rural_health_unit_id,
                    'source_health_record_id' => $record->id, 'patient_snapshot' => $preview['patient_snapshot'], 'source_snapshot' => $preview['source_snapshot'],
                    'status' => 'issued', 'version' => 1, 'authorized_by' => $request->user()->id, 'authorized_name' => $request->user()->name, 'authorized_at' => now()]);
                $this->event($request, $row, $data['request_key'], $hash, $fields['reason'], now('Asia/Manila')->toDateString());
                app(AuditLogger::class)->log($request, 'created', 'tb_dr_referrals', "Authorized outbound DR-TB referral {$row->id} from consultation {$record->id}.");

                return ['referral' => $row->fresh(), 'created' => true];
            }, 3);
        } catch (QueryException $exception) {
            if ($prior = TbDrReferralEvent::where('request_key', $data['request_key'])->first()) {
                return $this->retry($request->user(), $prior, $hash);
            }
            throw $exception;
        }
    }

    public function changeStatus(Request $request, int $id, array $data): TbDrReferral
    {
        $this->ensureWriter($request->user());
        $visible = $this->scope($request->user())->findOrFail($id);
        $hash = hash('sha256', json_encode(['status', $id, $request->user()->id, (int) $data['version'], $data['status'], $data['event_on'], trim($data['note'])], JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($request, $visible, $data, $hash) {
            HealthRecord::whereKey($visible->source_health_record_id)->lockForUpdate()->firstOrFail();
            $row = $this->scope($request->user())->whereKey($visible->id)->lockForUpdate()->firstOrFail();
            if ($prior = TbDrReferralEvent::where('request_key', $data['request_key'])->first()) {
                return $this->retry($request->user(), $prior, $hash)['referral'];
            }
            abort_unless($row->version === (int) $data['version'], 409, 'The referral changed. Refresh before recording disposition.');
            abort_unless(in_array($data['status'], TbDrReferral::TRANSITIONS[$row->status], true), 409, 'That disposition is not available from the recorded referral status.');
            $lastDate = $row->events()->orderByDesc('version')->firstOrFail()->event_on->toDateString();
            if ($data['event_on'] < $lastDate || $data['event_on'] > now('Asia/Manila')->toDateString()) {
                throw ValidationException::withMessages(['event_on' => 'Use a date from the last recorded event through today.']);
            }
            $row->update(['status' => $data['status'], 'version' => $row->version + 1]);
            $this->event($request, $row, $data['request_key'], $hash, trim($data['note']), $data['event_on']);
            app(AuditLogger::class)->log($request, 'updated', 'tb_dr_referrals', "Recorded {$row->status} for outbound DR-TB referral {$row->id}, version {$row->version}.");

            return $row->fresh();
        }, 3);
    }

    private function event(Request $request, TbDrReferral $row, string $key, string $hash, string $note, string $date): void
    {
        $row->events()->create(['version' => $row->version, 'status' => $row->status, 'note' => $note, 'event_on' => $date,
            'recorded_by' => $request->user()->id, 'recorder_name' => $request->user()->name, 'recorded_at' => now(), 'request_key' => $key, 'request_hash' => $hash]);
    }

    private function retry(User $user, TbDrReferralEvent $prior, string $hash): array
    {
        abort_unless(hash_equals($prior->request_hash, $hash), 409, 'This submission identity belongs to another referral or disposition.');

        return ['referral' => $this->scope($user)->findOrFail($prior->tb_dr_referral_id), 'created' => false];
    }

    public function present(User $user, TbDrReferral $row): array
    {
        $row->loadMissing(['events' => fn ($query) => $query->orderBy('version')]);
        $allowed = TbDrReferral::TRANSITIONS[$row->status];

        return [...$row->toArray(), 'reference' => 'DRR-'.$row->authorized_at->copy()->timezone('Asia/Manila')->year.'-'.str_pad((string) $row->id, 6, '0', STR_PAD_LEFT),
            'status_label' => TbDrReferral::STATUS_LABELS[$row->status], 'can_update' => $this->canAuthorize($user) && $allowed !== [],
            'allowed_statuses' => array_map(fn ($status) => ['value' => $status, 'label' => TbDrReferral::STATUS_LABELS[$status]], $allowed),
            'earliest_event_on' => $row->events->last()?->event_on->toDateString(), 'today' => now('Asia/Manila')->toDateString()];
    }
}
