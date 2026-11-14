<?php

namespace App\Services;

use App\Models\HealthRecord;
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

    /**
     * BHC General Consultation results are already available and name a free-text source.
     * RHU validation stays on rules().
     */
    public static function bhcRules(string $prefix = 'laboratory_tests'): array
    {
        return [
            $prefix => ['nullable', 'array', 'max:50'],
            "$prefix.*" => ['array:id,testName,collectionDate,examinationDate,resultStatus,result,resultSource,remarks'],
            "$prefix.*.id" => ['required', 'uuid', 'distinct:ignore_case'],
            "$prefix.*.testName" => ['required', 'string', 'max:255'],
            "$prefix.*.collectionDate" => ['nullable', 'date_format:Y-m-d'],
            "$prefix.*.examinationDate" => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            "$prefix.*.resultStatus" => ['required', Rule::in(['Result Available'])],
            "$prefix.*.result" => ['required', 'string', 'max:10000'],
            "$prefix.*.resultSource" => ['required', 'string', 'max:150', function (string $attribute, mixed $value, \Closure $fail): void {
                if (trim((string) $value) === '') {
                    $fail('Enter where this result came from.');
                }
            }],
            "$prefix.*.remarks" => ['nullable', 'string', 'max:1000'],
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
        $ownBhcConsultation = $user->isBhc()
            && $record->isBhcGeneralV2()
            && (int) $record->barangay_health_center_id === (int) $user->barangay_health_center_id;
        // BHC staff read RHU evidence only through a pinned handoff, except their own consultation.
        abort_if($user->isBhc() && $record->rural_health_unit_id && ! $ownBhcConsultation, 403);
        $access->authorizePatient($user, $record->patient);
        abort_unless($access->scopePatientHealthRecords(HealthRecord::query(), $user)->whereKey($record->id)->exists(), 403);
    }

    public function authorizeAddendum(User $user, HealthRecord $record): void
    {
        ActionPermissions::ensure($user, 'records.correct');
        if ($user->isBhc()) {
            abort_unless($record->isBhcGeneralV2()
                && (int) $record->barangay_health_center_id === (int) $user->barangay_health_center_id, 403);
        } else {
            abort_unless($user->isRhu() && $record->rural_health_unit_id
                && ! $record->isBhcGeneralV2()
                && (int) $record->rural_health_unit_id === (int) $user->rural_health_unit_id, 403);
        }
        $this->authorizeRead($user, $record);
    }

    // Called inside the consultation's existing finalization transaction.
    public function finalize(Request $request, HealthRecord $record, array $entries): void
    {
        foreach ($entries as $entry) {
            LaboratoryTest::create([
                'patient_id' => $record->patient_id,
                'health_record_id' => $record->id,
                'client_id' => strtolower($entry['id']),
                'data' => $entry,
                'created_by' => $request->user()->id,
            ]);
        }
        if ($entries !== []) {
            app(AuditLogger::class)->log($request, 'created', 'laboratory_tests', "Recorded laboratory evidence for health record {$record->id}.");
        }

        $this->remapDiagnosisLaboratoryReferences($record);
    }

    /**
     * Normalize care_plan.service_supporting_labs into monitoring_data.serviceSupportingLabs.
     * Keeps current:/record: references intact; remap happens after laboratory rows persist.
     *
     * @param  mixed  $rows
     * @return list<array{program: string, supportingLaboratoryTests: list<array{reference: string}>}>
     */
    public static function normalizeServiceSupportingLabs(mixed $rows): array
    {
        if (! is_array($rows)) {
            return [];
        }

        $normalized = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $program = trim((string) ($row['program'] ?? ''));
            if ($program === '' || ! isset(ConsultationPrograms::CLASSIFICATIONS[$program])) {
                continue;
            }
            $tests = $row['supportingLaboratoryTests'] ?? $row['supporting_laboratory_tests'] ?? [];
            if (! is_array($tests)) {
                continue;
            }
            $seen = [];
            $mapped = [];
            foreach ($tests as $selection) {
                if (! is_array($selection)) {
                    continue;
                }
                $reference = trim((string) ($selection['reference'] ?? ''));
                if ($reference === '' || isset($seen[$reference])) {
                    continue;
                }
                if (! str_starts_with($reference, 'current:') && ! preg_match('/^record:\d+$/', $reference)) {
                    continue;
                }
                $seen[$reference] = true;
                $mapped[] = ['reference' => $reference];
            }
            if ($mapped === []) {
                continue;
            }
            $normalized[] = [
                'program' => $program,
                'supportingLaboratoryTests' => $mapped,
            ];
        }

        return $normalized;
    }

    /**
     * Persist durable record:id links for diagnosis and service clinical associations.
     * Does not create BHC sharing rows or mutate laboratory source data.
     *
     * @return void
     */
    public function remapDiagnosisLaboratoryReferences(HealthRecord $record): void
    {
        $clientToId = LaboratoryTest::query()
            ->where('health_record_id', $record->id)
            ->pluck('id', 'client_id');

        $diagnoses = is_array($record->diagnoses) ? $record->diagnoses : [];
        $diagnosesChanged = false;

        foreach ($diagnoses as $index => $entry) {
            if (! is_array($entry) || ! is_array($entry['supportingLaboratoryTests'] ?? null)) {
                continue;
            }
            $mapped = self::mapSupportingReferences($entry['supportingLaboratoryTests'], $clientToId);
            if (($entry['supportingLaboratoryTests'] ?? null) !== $mapped) {
                $diagnosesChanged = true;
            }
            $diagnoses[$index]['supportingLaboratoryTests'] = $mapped;
        }

        $monitoringData = is_array($record->monitoring_data) ? $record->monitoring_data : [];
        $serviceRows = is_array($monitoringData['serviceSupportingLabs'] ?? null)
            ? $monitoringData['serviceSupportingLabs']
            : [];
        $serviceChanged = false;
        $remappedServices = [];
        foreach ($serviceRows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $program = trim((string) ($row['program'] ?? ''));
            if ($program === '') {
                continue;
            }
            $tests = $row['supportingLaboratoryTests'] ?? $row['supporting_laboratory_tests'] ?? [];
            $mapped = self::mapSupportingReferences(is_array($tests) ? $tests : [], $clientToId);
            if ($mapped === []) {
                continue;
            }
            $next = [
                'program' => $program,
                'supportingLaboratoryTests' => $mapped,
            ];
            $previous = [
                'program' => $program,
                'supportingLaboratoryTests' => is_array($row['supportingLaboratoryTests'] ?? null)
                    ? $row['supportingLaboratoryTests']
                    : (is_array($row['supporting_laboratory_tests'] ?? null) ? $row['supporting_laboratory_tests'] : []),
            ];
            if ($previous !== $next) {
                $serviceChanged = true;
            }
            $remappedServices[] = $next;
        }
        if (count($serviceRows) !== count($remappedServices)) {
            $serviceChanged = true;
        }

        $updates = [];
        if ($diagnosesChanged) {
            $updates['diagnoses'] = array_values($diagnoses);
        }
        if ($serviceChanged) {
            $monitoringData['serviceSupportingLabs'] = $remappedServices;
            $updates['monitoring_data'] = $monitoringData;
        }
        if ($updates !== []) {
            $record->forceFill($updates)->save();
        }
    }

    /**
     * @param  list<mixed>  $selections
     * @param  \Illuminate\Support\Collection<string, int|string>  $clientToId
     * @return list<array{reference: string}>
     */
    private static function mapSupportingReferences(array $selections, $clientToId): array
    {
        $seen = [];
        $mapped = [];
        foreach ($selections as $selection) {
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

        return $mapped;
    }

    public function present(HealthRecord $record): array
    {
        return $record->laboratoryTests()->with('addenda')->orderBy('id')->get()->map(function ($test) {
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
            ];
        })->all();
    }
}
