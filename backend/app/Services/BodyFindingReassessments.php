<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class BodyFindingReassessments
{
    public static function rules(string $prefix): array
    {
        return [
            $prefix => ['nullable', 'array', 'list', 'max:500'],
            "$prefix.*" => ['required', 'array'],
            "$prefix.*.sourceRecordId" => ['required', 'integer', 'min:1'],
            "$prefix.*.sourceFindingIndex" => ['required', 'integer', 'min:0'],
            "$prefix.*.expectedRevision" => ['required', 'integer', 'min:0'],
            "$prefix.*.status" => ['required', 'in:still_present,no_longer_present'],
        ];
    }

    /** Called inside official-save transaction, after patient lock acquisition. */
    public function snapshots(Patient $patient, User $user, array $decisions): array
    {
        if ($decisions === []) {
            return [];
        }
        $records = app(FacilityAccessService::class)
            ->scopePatientHealthRecords(HealthRecord::query(), $user)
            ->where('patient_id', $patient->id)->orderBy('id')->get();
        $sources = $records->keyBy('id');
        $latest = [];
        foreach ($records as $record) {
            foreach ($record->monitoring_data['bodyFindingReassessments'] ?? [] as $event) {
                if (! is_array($event) || ! isset($event['sourceRecordId'], $event['sourceFindingIndex'])) {
                    continue;
                }
                $latest[$event['sourceRecordId'].':'.$event['sourceFindingIndex']] = [
                    'revision' => $record->id, 'status' => $event['status'] ?? null,
                ];
            }
        }
        $seen = [];
        return array_map(function (array $decision, int $index) use ($sources, $latest, &$seen): array {
            $sourceId = (int) $decision['sourceRecordId'];
            $position = (int) $decision['sourceFindingIndex'];
            $key = "$sourceId:$position";
            $source = $sources->get($sourceId);
            $finding = $source?->body_findings[$position] ?? null;
            $field = "monitoring_data.bodyFindingReassessments.$index";
            if (isset($seen[$key]) || ! is_array($finding)
                || ! in_array($finding['region'] ?? null, HealthRecord::BODY_REGIONS, true)
                || ! is_string($finding['finding'] ?? null) || trim($finding['finding']) === '') {
                throw ValidationException::withMessages([$field => 'This finding is unavailable or duplicated. Refresh previous findings and review your choices.']);
            }
            $seen[$key] = true;
            $previous = $latest[$key] ?? ['revision' => 0, 'status' => null];
            if ((int) $decision['expectedRevision'] !== (int) $previous['revision'] || $previous['status'] === 'no_longer_present') {
                throw ValidationException::withMessages([$field => 'This finding was reassessed in another consultation. Refresh previous findings and review your choices.']);
            }

            return [
                'sourceRecordId' => $sourceId, 'sourceFindingIndex' => $position,
                'expectedRevision' => (int) $previous['revision'], 'status' => $decision['status'],
                // Use only the server's immutable source, never client-supplied text.
                'finding' => \Illuminate\Support\Arr::only($finding, ['id', 'region', 'side', 'location', 'finding', 'note']),
                'sourceDate' => $source->date_recorded?->toIso8601String(),
            ];
        }, $decisions, array_keys($decisions));
    }
}
