<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\LaboratoryTest;
use App\Models\RuralHealthUnit;
use App\Models\RhuVisitQueueEntry;
use App\Models\TbTreatmentCase;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

final class TbCaseRegistrationService
{
    public function __construct(private readonly TbClinicalAuthority $authority, private readonly TbCaseNumberAllocator $numbers) {}

    public function authorizeRead(User $user, HealthRecord $record): void
    {
        ActionPermissions::ensure($user, 'clinical.history');
        app(FacilityAccessService::class)->ensureValidFacilityAssignment($user);
        abort_unless($user->isRhu() && (int) $record->rural_health_unit_id === (int) $user->rural_health_unit_id, 403, FacilityAccessService::DENIED_MESSAGE);
    }

    public function preview(User $user, HealthRecord $record): array
    {
        $this->authorizeRead($user, $record);
        $snapshot = $this->snapshot($record);
        $case = TbTreatmentCase::where('source_health_record_id', $record->id)->first();
        [$reason] = $this->blocked($record, $case, true);
        $diagnosis = $snapshot['diagnosis'] ?? [];
        $weight = $record->vital_signs['weightKg'] ?? $record->vital_signs['weight'] ?? '';
        $screening = $this->screeningPrefill($record);
        $facility = RuralHealthUnit::find($record->rural_health_unit_id);

        return [
            'eligible' => $reason === null, 'reason' => $reason, 'case' => $case,
            'can_register' => TbClinicalAuthority::canConfirm($user) && ActionPermissions::allows($user, 'consultations.finalize'),
            'source_revision' => $this->revision($record, $snapshot), 'reporting_year' => now('Asia/Manila')->year,
            'laboratory_tests' => $snapshot['laboratory_tests'],
            'screening_date_source' => $screening['screeningDateSource'],
            'referral_source_label' => $screening['referralSourceLabel'],
            'card_data' => [
                'caseFinding' => [
                    'diagnosingFacility' => $facility?->name ?? '',
                    'provinceHuc' => $this->provinceFromFacilityAddress($facility?->address),
                    'dateOfScreening' => $screening['dateOfScreening'],
                ],
                'diagnosis' => ['diagnosisType' => $diagnosis['tbManagement']['diagnosisType'] ?? '',
                    'dateOfDiagnosis' => ($record->date_recorded ?? $record->finalized_at)?->copy()->timezone('Asia/Manila')->toDateString(),
                    'attendingPhysician' => $snapshot['physician_name']],
                'classification' => ['drugResistance' => $diagnosis['tbManagement']['drugResistance'] ?? ''],
                'regimen' => ['weightKg' => is_numeric($weight) && (float) $weight > 0 ? $weight : ''],
            ],
        ];
    }

    /** The whole source is pinned, including the latest addendum of each source lab. */
    public function snapshot(HealthRecord $record): array
    {
        $diagnoses = array_values(array_filter($record->diagnoses ?? [], fn ($entry) => $this->authority->isTbName($entry['name'] ?? null)));
        $labs = app(LaboratoryEvidenceService::class)->present($record);

        return [
            'diagnosis' => count($diagnoses) === 1 ? $diagnoses[0] : null,
            'finalized_by' => $record->finalized_by, 'finalized_at' => $record->finalized_at?->toISOString(),
            'physician_name' => $record->tb_assessment_authority['physician_name'] ?? User::find($record->finalized_by)?->name ?? '',
            'authority' => $record->tb_assessment_authority,
            'laboratory_tests' => array_map(fn ($lab) => Arr::only($lab, [
                'id', 'recordId', 'testName', 'collectionDate', 'examinationDate', 'resultStatus', 'result', 'version',
            ]), $labs),
        ];
    }

    public function revision(HealthRecord $record, ?array $snapshot = null): string
    {
        $snapshot ??= $this->snapshot($record);

        return $this->fingerprint([$record->id, $record->patient_id, $record->rural_health_unit_id,
            $record->updated_at?->toISOString(), $record->diagnoses, $snapshot]);
    }

    /** @return array{?string, int} */
    public function blocked(HealthRecord $record, ?TbTreatmentCase $case = null, bool $requireDeferredDecision = false): array
    {
        if ($case) {
            return ['Form 4B is already registered for this consultation.', 409];
        }
        if (! $this->authority->hasPhysicianFinalization($record)) {
            return ['Finalize the TB assessment with an RHU physician before registering Form 4B.', 422];
        }
        $entries = array_values(array_filter($record->diagnoses ?? [], fn ($entry) => $this->authority->isTbName($entry['name'] ?? null)));
        if (count($entries) !== 1) {
            return ['A single structured TB assessment is required. Resolve missing or conflicting diagnoses in a new consultation.', 422];
        }
        $assessment = $entries[0]['tbManagement'] ?? [];
        if (($assessment['diagnosisType'] ?? null) !== 'tb_disease' || ($assessment['drugResistance'] ?? null) !== 'drug_susceptible') {
            return ['Form 4B requires TB Disease with drug-susceptible classification. TB Infection and DR-TB are not eligible.', 422];
        }
        if ($requireDeferredDecision) {
            $decision = $assessment['treatmentDecision'] ?? null;
            $allowed = $decision === null
                || $decision === ''
                || in_array($decision, ['not_yet_initiated', 'refer_elsewhere'], true);
            if (! $allowed) {
                return ['Delayed Form 4B registration is available when treatment was not initiated in the consultation.', 422];
            }
        }
        if (TbTreatmentCase::where('patient_id', $record->patient_id)->where('status', 'active')->exists()
            || TbCaseEndorsementService::hasActiveLinkedCase((int) $record->patient_id)) {
            return ['An active TB treatment case already exists for this patient.', 409];
        }
        $terminal = ['cured', 'treatment_completed', 'treatment_failed', 'lost_to_follow_up', 'died', 'not_evaluated'];
        foreach (HealthRecord::where('patient_id', $record->patient_id)->whereNotNull('tb_data')->cursor() as $legacy) {
            $number = $legacy->tb_data['diagnosis']['tbCaseNumber'] ?? '';
            if (is_string($number) && TbTreatmentCase::canonicalCaseNumber($number) !== ''
                && ($legacy->id === $record->id || ! in_array($legacy->tb_data['outcome']['status'] ?? '', $terminal, true))) {
                return ['A legacy TB card needs reconciliation before a new treatment case can be registered.', 409];
            }
        }

        return [null, 200];
    }

    /** @return array{case: TbTreatmentCase, created: bool} */
    public function register(Request $request, HealthRecord $source, array $data): array
    {
        return $this->registerForSource($request->user(), $source, $data, $request, false);
    }

    /**
     * Shared registration used by delayed POST and atomic consultation finalize.
     *
     * @return array{case: TbTreatmentCase, created: bool}
     */
    public function registerForSource(User $user, HealthRecord $source, array $data, ?Request $request = null, bool $withinExistingTransaction = false): array
    {
        TbClinicalAuthority::ensurePhysician($user);
        ActionPermissions::ensure($user, 'consultations.finalize');
        $this->authorizeRead($user, $source);
        $data['case_number'] = filled($data['case_number'] ?? null) ? TbTreatmentCase::canonicalCaseNumber($data['case_number']) : null;
        $data['reporting_year'] = (int) $data['reporting_year'];
        $key = $data['registration_key'];
        $hash = $this->fingerprint(['source' => $source->id, 'payload' => Arr::except($data, ['registration_key'])]);
        $run = function () use ($user, $source, $data, $key, $hash, $request) {
            TbCaseEndorsementService::lockIdentityPatients((int) $source->patient_id);
            $record = HealthRecord::whereKey($source->id)->lockForUpdate()->firstOrFail();
            abort_unless((int) $record->patient_id === (int) $source->patient_id, 409, 'The consultation source changed. Refresh before registration.');
            $this->authorizeRead($user, $record);
            if ($existing = TbTreatmentCase::where('registration_key', $key)->first()) {
                return $this->retry($existing, $record, $hash);
            }
            $case = TbTreatmentCase::where('source_health_record_id', $record->id)->first();
            [$reason, $status] = $this->blocked($record, $case, (bool) ($data['require_deferred_decision'] ?? false));
            abort_if($reason !== null, $status, $reason ?? '');
            LaboratoryTest::where('health_record_id', $record->id)->orderBy('id')->lockForUpdate()->get();
            $snapshot = $this->snapshot($record);
            $revision = $this->revision($record, $snapshot);
            if (! ($data['trust_source_revision'] ?? false)) {
                abort_unless(hash_equals($revision, (string) ($data['source_revision'] ?? '')), 409, 'Diagnostic evidence changed. Refresh and review the assessment before registering.');
            }
            $prefill = $this->preview($user, $record)['card_data'];
            $card = $data['card_data'];
            foreach (['caseFinding', 'diagnosis', 'classification'] as $group) {
                $card[$group] = [...($card[$group] ?? []), ...$prefill[$group]];
            }
            if (filled($data['treatment_start_date'] ?? null) && blank($card['phases']['intensiveStart'] ?? null)) {
                $card['phases'] = [...($card['phases'] ?? []), 'intensiveStart' => $data['treatment_start_date']];
            }
            $number = $this->numbers->allocate((int) $record->rural_health_unit_id, $data['reporting_year'], $data['case_number']);
            $card['diagnosis']['tbCaseNumber'] = $number;
            $case = TbTreatmentCase::create([
                'patient_id' => $record->patient_id, 'rural_health_unit_id' => $record->rural_health_unit_id,
                'source_health_record_id' => $record->id, 'reporting_year' => $data['reporting_year'], 'case_number' => $number,
                'status' => 'active', 'registered_by' => $user->id, 'registered_at' => now(),
                'diagnosis_snapshot' => $snapshot, 'card_data' => $card, 'registration_key' => $key, 'registration_hash' => $hash,
            ]);
            if ($request) {
                app(AuditLogger::class)->log($request, 'created', 'tb_treatment_cases', "Registered Form 4B case {$case->id} from consultation {$record->id}.");
            }

            return ['case' => $case->fresh(), 'created' => true];
        };

        try {
            return $withinExistingTransaction ? $run() : DB::transaction($run, 3);
        } catch (QueryException $exception) {
            if ($existing = TbTreatmentCase::where('registration_key', $key)->first()) {
                return $this->retry($existing, $source, $hash);
            }
            throw $exception;
        }
    }

    /**
     * Derive Province / HUC from the RHU address already stored in facility
     * configuration (for example "Bulakan, Bulacan" → "Bulacan"). No hardcode.
     */
    public function provinceFromFacilityAddress(?string $address): string
    {
        $parts = array_values(array_filter(array_map('trim', explode(',', (string) $address)), fn ($part) => $part !== ''));

        return $parts === [] ? '' : (string) end($parts);
    }

    /** @return array{dateOfScreening: string, screeningDateSource: string, referralSourceLabel: string} */
    public function screeningPrefill(HealthRecord $record): array
    {
        $visit = null;
        if (filled($record->consultation_uuid)) {
            $visit = RhuVisitQueueEntry::query()
                ->where('consultation_uuid', $record->consultation_uuid)
                ->with('referral.barangayHealthCenter')
                ->first();
        }
        $referral = $visit?->referral;
        $documented = $referral?->screening_date ?? $referral?->date_of_screening ?? null;
        if (filled($documented)) {
            return [
                'dateOfScreening' => substr((string) $documented, 0, 10),
                'screeningDateSource' => 'bhc_screening',
                'referralSourceLabel' => $referral?->barangayHealthCenter?->name ?? 'BHC referral',
            ];
        }
        if ($referral) {
            $referralDate = optional($referral->referral_datetime)->timezone('Asia/Manila')?->toDateString();

            return [
                'dateOfScreening' => $referralDate
                    ?: optional($record->date_recorded)->timezone('Asia/Manila')?->toDateString()
                    ?: now('Asia/Manila')->toDateString(),
                'screeningDateSource' => $referralDate ? 'referral_fallback' : 'rhu_visit',
                'referralSourceLabel' => $referral->barangayHealthCenter?->name ?? 'BHC referral',
            ];
        }

        return [
            'dateOfScreening' => optional($record->date_recorded)->timezone('Asia/Manila')?->toDateString()
                ?: now('Asia/Manila')->toDateString(),
            'screeningDateSource' => 'rhu_visit',
            'referralSourceLabel' => 'RHU walk-in',
        ];
    }

    private function retry(TbTreatmentCase $case, HealthRecord $source, string $hash): array
    {
        abort_unless((int) $case->source_health_record_id === (int) $source->id
            && (int) $case->rural_health_unit_id === (int) $source->rural_health_unit_id
            && hash_equals((string) $case->registration_hash, $hash), 409, 'This submission identity is already bound to another registration.');

        return ['case' => $case, 'created' => false];
    }

    private function fingerprint(array $value): string
    {
        $sort = function ($node) use (&$sort) {
            if (! is_array($node)) {
                return $node;
            }
            if (! array_is_list($node)) {
                ksort($node);
            }

            return array_map($sort, $node);
        };

        return hash('sha256', json_encode($sort($value), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }
}
