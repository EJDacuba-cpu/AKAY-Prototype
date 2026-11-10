<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\LaboratoryAttachment;
use App\Models\LaboratoryTest;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LaboratoryEvidenceService
{
    public const STATUSES = ['Requested', 'Awaiting Result', 'Result Available'];

    public static function rules(string $prefix = 'laboratory_tests'): array
    {
        return [
            $prefix => ['nullable', 'array', 'max:50'],
            "$prefix.*" => ['array:id,testName,collectionDate,examinationDate,resultStatus,result'],
            "$prefix.*.id" => ['required', 'uuid', 'distinct:ignore_case'],
            "$prefix.*.testName" => ['required', 'string', 'max:255'],
            "$prefix.*.collectionDate" => ['nullable', 'date_format:Y-m-d'],
            "$prefix.*.examinationDate" => ['nullable', 'date_format:Y-m-d'],
            "$prefix.*.resultStatus" => ['required', Rule::in(self::STATUSES)],
            "$prefix.*.result" => ["required_if:$prefix.*.resultStatus,Result Available", 'nullable', 'string', 'max:10000'],
        ];
    }

    public function authorizeRead(User $user, HealthRecord $record): void
    {
        if (! $user->isAdmin()) {
            ActionPermissions::ensure($user, 'clinical.history');
        }
        $access = app(FacilityAccessService::class);
        $access->ensureValidFacilityAssignment($user);
        // BHC evidence access goes through a specific handoff and its pinned
        // versions, never through the source RHU laboratory listing.
        abort_if($user->isBhc() && $record->rural_health_unit_id, 403);
        $access->authorizePatient($user, $record->patient);
        abort_unless($access->scopePatientHealthRecords(HealthRecord::query(), $user)->whereKey($record->id)->exists(), 403);
    }

    public function authorizeAddendum(User $user, HealthRecord $record): void
    {
        ActionPermissions::ensure($user, 'records.correct');
        abort_unless($user->isRhu() && $record->rural_health_unit_id
            && (int) $record->rural_health_unit_id === (int) $user->rural_health_unit_id, 403);
        $this->authorizeRead($user, $record);
    }

    // Called inside the consultation's existing finalization transaction.
    public function finalize(Request $request, HealthRecord $record, array $entries): void
    {
        foreach ($entries as $entry) {
            $test = LaboratoryTest::create([
                'patient_id' => $record->patient_id,
                'health_record_id' => $record->id,
                'client_id' => strtolower($entry['id']),
                'data' => $entry,
                'created_by' => $request->user()->id,
            ]);
            LaboratoryAttachment::query()
                ->where('patient_id', $record->patient_id)
                ->where('consultation_uuid', $record->consultation_uuid)
                ->where('test_client_id', $test->client_id)
                ->whereNull('health_record_id')->whereNull('removed_at')
                ->update(['health_record_id' => $record->id]);
        }
        if ($entries !== []) {
            app(AuditLogger::class)->log($request, 'created', 'laboratory_tests', "Recorded laboratory evidence for health record {$record->id}.");
        }
        LaboratoryAttachment::query()->where('patient_id', $record->patient_id)
            ->where('consultation_uuid', $record->consultation_uuid)->whereNull('health_record_id')
            ->whereNull('removed_at')->update(['removed_at' => now()]);

        $this->remapDiagnosisLaboratoryReferences($record);
    }

    /**
     * Persist durable record:id links for diagnosis clinical associations.
     * Does not create BHC sharing rows or mutate laboratory source data.
     *
     * @return void
     */
    public function remapDiagnosisLaboratoryReferences(HealthRecord $record): void
    {
        $diagnoses = is_array($record->diagnoses) ? $record->diagnoses : [];
        if ($diagnoses === []) {
            return;
        }

        $clientToId = LaboratoryTest::query()
            ->where('health_record_id', $record->id)
            ->pluck('id', 'client_id');
        $changed = false;

        foreach ($diagnoses as $index => $entry) {
            if (! is_array($entry) || ! is_array($entry['supportingLaboratoryTests'] ?? null)) {
                continue;
            }
            $seen = [];
            $mapped = [];
            foreach ($entry['supportingLaboratoryTests'] as $selection) {
                if (! is_array($selection)) {
                    continue;
                }
                $reference = trim((string) ($selection['reference'] ?? ''));
                if (str_starts_with($reference, 'current:')) {
                    $clientId = strtolower(substr($reference, 8));
                    $testId = $clientToId[$clientId] ?? null;
                    if ($testId === null) {
                        continue;
                    }
                    $reference = 'record:'.$testId;
                } elseif (! preg_match('/^record:\d+$/', $reference)) {
                    continue;
                }
                if (isset($seen[$reference])) {
                    continue;
                }
                $seen[$reference] = true;
                $mapped[] = ['reference' => $reference];
            }
            if (($entry['supportingLaboratoryTests'] ?? null) !== $mapped) {
                $changed = true;
            }
            $diagnoses[$index]['supportingLaboratoryTests'] = $mapped;
        }

        if ($changed) {
            $record->forceFill(['diagnoses' => array_values($diagnoses)])->save();
        }
    }

    public function present(HealthRecord $record): array
    {
        $attachments = LaboratoryAttachment::query()->where('health_record_id', $record->id)
            ->whereNull('removed_at')->get()->groupBy('test_client_id');

        return $record->laboratoryTests()->with('addenda')->orderBy('id')->get()->map(function ($test) use ($attachments) {
            $latest = $test->addenda->last();

            return [
                ...($latest?->data ?? $test->data),
                'recordId' => $test->id,
                'healthRecordId' => $test->health_record_id,
                'patientId' => $test->patient_id,
                'createdBy' => $test->created_by,
                'createdAt' => $test->created_at->toISOString(),
                'version' => $latest?->id ?? 0,
                'original' => $test->data,
                'addenda' => $test->addenda->map(fn ($addendum) => [
                    'id' => $addendum->id, 'data' => $addendum->data, 'reason' => $addendum->reason,
                    'createdBy' => $addendum->created_by, 'createdAt' => $addendum->created_at->toISOString(),
                ])->all(),
                'attachments' => ($attachments->get($test->client_id) ?? collect())->values()->all(),
            ];
        })->all();
    }
}
