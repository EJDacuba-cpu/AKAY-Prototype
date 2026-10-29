<?php

namespace App\Services;

/**
 * Independent BHC return schedules stored on health_records.monitoring_data
 * and mirrored onto follow_up_tasks. Legacy records with a single
 * followUpDate remain one schedule with purpose_key "visit".
 */
final class FollowUpSchedules
{
    public const VISIT_KEY = 'visit';

    public static function serviceKey(string $program): string
    {
        return 'service:'.str_replace(' ', '-', strtolower(trim($program)));
    }

    public static function isScheduledServiceFollowUp(\App\Models\FollowUpTask $task): bool
    {
        $key = self::text($task->purpose_key !== null && $task->purpose_key !== '' ? $task->purpose_key : self::VISIT_KEY);
        if (str_starts_with($key, 'entry:') || str_starts_with($key, 'continued:')) {
            return false;
        }
        foreach (array_keys(ConsultationPrograms::CLASSIFICATIONS) as $program) {
            if ($key === self::serviceKey($program)) {
                return true;
            }
        }
        if ($key !== self::VISIT_KEY) {
            return false;
        }
        $record = $task->healthRecord;
        $programs = is_array($record?->monitoring_data['selectedPrograms'] ?? null)
            ? $record->monitoring_data['selectedPrograms']
            : [];
        foreach ($programs as $program) {
            if (is_string($program) && isset(ConsultationPrograms::CLASSIFICATIONS[$program])) {
                return true;
            }
        }
        $category = (string) ($record?->category ?? '');

        return in_array($category, ConsultationPrograms::CLASSIFICATIONS, true);
    }

    public const PURPOSE_MAX = 150;

    public const KEY_MAX = 64;

    /**
     * @param  array<string, mixed>  $monitoringData
     * @return array<int, array{purpose_key: string, purpose: string, date: string, time: ?string, predecessor_task_id: ?int, source_entry_id: ?string}>
     */
    public static function fromMonitoringData(array $monitoringData): array
    {
        $raw = $monitoringData['followUpSchedules'] ?? $monitoringData['follow_up_schedules'] ?? null;
        if (is_array($raw)) {
            return self::normalizeList($raw);
        }

        $date = self::text($monitoringData['followUpDate'] ?? $monitoringData['follow_up_date'] ?? null);
        if ($date === '') {
            return [];
        }

        $purpose = self::text($monitoringData['followUpReason'] ?? $monitoringData['follow_up_reason'] ?? null);

        return [self::item([
            'purposeKey' => self::VISIT_KEY,
            'purpose' => $purpose !== '' ? $purpose : 'BHC follow-up',
            'date' => $date,
            'time' => $monitoringData['followUpTime'] ?? $monitoringData['follow_up_time'] ?? null,
        ])];
    }

    /**
     * @param  array<string, mixed>  $monitoringData
     * @param  array<string, mixed>  $carePlan
     * @return array<int, array{purpose_key: string, purpose: string, date: string, time: ?string, predecessor_task_id: ?int, source_entry_id: ?string}>
     */
    public static function forV2Save(array $monitoringData, array $carePlan): array
    {
        $raw = $monitoringData['followUpSchedules'] ?? $monitoringData['follow_up_schedules'] ?? null;
        if (is_array($raw) && $raw !== []) {
            return self::normalizeList($raw);
        }

        if (! filter_var($carePlan['bhc_follow_up'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            return [];
        }

        $legacy = $monitoringData;
        unset($legacy['followUpSchedules'], $legacy['follow_up_schedules']);

        return self::fromMonitoringData($legacy);
    }

    /**
     * Compatibility mirrors so older readers still see one visit-level date.
     *
     * @param  array<int, array{purpose_key: string, purpose: string, date: string, time: ?string, predecessor_task_id: ?int, source_entry_id: ?string}>  $schedules
     * @return array<int, array<string, mixed>>
     */
    public static function storedList(array $schedules): array
    {
        return array_map(fn (array $schedule) => [
            'purposeKey' => $schedule['purpose_key'],
            'purpose' => $schedule['purpose'],
            'date' => $schedule['date'],
            'time' => $schedule['time'],
            'predecessorTaskId' => $schedule['predecessor_task_id'],
            'sourceEntryId' => $schedule['source_entry_id'],
        ], $schedules);
    }

    /**
     * @param  array<int, mixed>  $raw
     * @return array<int, array{purpose_key: string, purpose: string, date: string, time: ?string, predecessor_task_id: ?int, source_entry_id: ?string}>
     */
    public static function normalizeList(array $raw): array
    {
        $items = [];
        foreach ($raw as $entry) {
            if (! is_array($entry)) {
                continue;
            }
            $item = self::item($entry);
            if ($item['date'] === '' || $item['purpose_key'] === '' || $item['purpose'] === '') {
                continue;
            }
            $items[] = $item;
        }

        return array_values($items);
    }

    /**
     * @param  array<string, mixed>  $entry
     * @return array{purpose_key: string, purpose: string, date: string, time: ?string, predecessor_task_id: ?int, source_entry_id: ?string}
     */
    public static function item(array $entry): array
    {
        $time = self::text($entry['time'] ?? $entry['dueTime'] ?? $entry['due_time'] ?? null);
        $predecessor = $entry['predecessorTaskId'] ?? $entry['predecessor_task_id'] ?? null;
        $sourceEntry = self::text($entry['sourceEntryId'] ?? $entry['source_entry_id'] ?? null);

        return [
            'purpose_key' => mb_substr(self::text($entry['purposeKey'] ?? $entry['purpose_key'] ?? self::VISIT_KEY), 0, self::KEY_MAX),
            'purpose' => mb_substr(self::text($entry['purpose'] ?? $entry['reason'] ?? ''), 0, self::PURPOSE_MAX),
            'date' => self::text($entry['date'] ?? $entry['dueDate'] ?? $entry['due_date'] ?? null),
            'time' => $time !== '' ? $time : null,
            'predecessor_task_id' => is_numeric($predecessor) && (int) $predecessor > 0 ? (int) $predecessor : null,
            'source_entry_id' => $sourceEntry !== '' ? mb_substr($sourceEntry, 0, 64) : null,
        ];
    }

    public static function purposeForTask(?string $taskPurpose, array $monitoringData, ?string $purposeKey): string
    {
        $own = self::text($taskPurpose);
        if ($own !== '') {
            return $own;
        }
        $key = self::text($purposeKey) !== '' ? self::text($purposeKey) : self::VISIT_KEY;
        foreach (self::fromMonitoringData($monitoringData) as $schedule) {
            if ($schedule['purpose_key'] === $key && $schedule['purpose'] !== '') {
                return $schedule['purpose'];
            }
        }

        return self::text($monitoringData['followUpReason'] ?? $monitoringData['follow_up_reason'] ?? null);
    }

    private static function text(mixed $value): string
    {
        return trim((string) ($value ?? ''));
    }
}
