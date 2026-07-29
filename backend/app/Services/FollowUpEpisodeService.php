<?php

namespace App\Services;

use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\User;
use Illuminate\Support\Collection;

class FollowUpEpisodeService
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess
    ) {}

    public function forRecord(HealthRecord $record, User $user): array
    {
        $root = $this->rootRecord($record, $user);
        $records = $this->episodeRecords($root, $user);
        $recordIds = $records->pluck('id')->all();

        // The episode records have already been role/facility scoped. Resolving
        // tasks strictly through those explicit record IDs lets every authorized
        // details path see the same chain without broadening module-level task
        // permissions.
        $tasks = FollowUpTask::query()
            ->whereIn('health_record_id', $recordIds)
            ->with(['patient', 'healthRecord', 'fulfilledByHealthRecord'])
            ->orderBy('due_date')
            ->orderBy('due_time')
            ->orderBy('id')
            ->get();

        $activeTask = $tasks->first(
            fn (FollowUpTask $task): bool => in_array(
                $task->state,
                FollowUpTask::ACTIVE_STATES,
                true
            )
                && $task->fulfilled_at === null
                && $task->fulfilled_by_health_record_id === null
        );

        return [
            'original_record' => $this->recordSummary($root),
            'records' => $records
                ->map(fn (HealthRecord $item): array => $this->recordSummary($item))
                ->values()
                ->all(),
            'tasks' => $tasks
                ->map(fn (FollowUpTask $task): array => $this->taskSummary($task))
                ->values()
                ->all(),
            'pending_next_follow_up' => $activeTask
                ? $this->taskSummary($activeTask)
                : null,
        ];
    }

    private function rootRecord(HealthRecord $record, User $user): HealthRecord
    {
        $current = $record;
        $seen = [(int) $current->id => true];

        while ($current->parent_health_record_id) {
            $parentId = (int) $current->parent_health_record_id;
            if (isset($seen[$parentId])) {
                break;
            }

            $parent = $this->facilityAccess
                ->scopeHealthRecords(HealthRecord::query(), $user)
                ->whereKey($parentId)
                ->where('patient_id', $record->patient_id)
                ->first();

            if (! $parent) {
                break;
            }

            $seen[$parentId] = true;
            $current = $parent;
        }

        return $current;
    }

    private function episodeRecords(
        HealthRecord $root,
        User $user
    ): Collection {
        $records = collect([$root]);
        $frontier = [(int) $root->id];
        $seen = [(int) $root->id => true];

        while ($frontier !== []) {
            $children = $this->facilityAccess
                ->scopeHealthRecords(HealthRecord::query(), $user)
                ->where('patient_id', $root->patient_id)
                ->whereIn('parent_health_record_id', $frontier)
                ->orderBy('date_recorded')
                ->orderBy('id')
                ->get();

            $frontier = [];

            foreach ($children as $child) {
                $childId = (int) $child->id;
                if (isset($seen[$childId])) {
                    continue;
                }

                $seen[$childId] = true;
                $records->push($child);
                $frontier[] = $childId;
            }
        }

        return $records
            ->sortBy(fn (HealthRecord $item): string => sprintf(
                '%s-%020d',
                optional($item->date_recorded)->format('Y-m-d H:i:s') ?? '',
                $item->id
            ))
            ->values();
    }

    private function recordSummary(?HealthRecord $record): ?array
    {
        if (! $record) {
            return null;
        }

        return [
            'id' => $record->id,
            'patient_id' => $record->patient_id,
            'category' => $record->category,
            'visit_type' => $record->visit_type ?: 'initial_consultation',
            'parent_health_record_id' => $record->parent_health_record_id,
            'date_recorded' => $record->date_recorded,
            'chief_complaint' => $record->chief_complaint,
            'diagnosis' => $record->diagnosis,
            'treatment_notes' => $record->treatment_notes,
            'notes' => $record->notes,
        ];
    }

    private function taskSummary(FollowUpTask $task): array
    {
        return [
            'id' => $task->id,
            'health_record_id' => $task->health_record_id,
            'patient_id' => $task->patient_id,
            'due_date' => $task->due_date,
            'due_time' => $task->due_time,
            'notes' => $task->notes,
            'state' => $task->state,
            'fulfilled_at' => $task->fulfilled_at,
            'cancelled_at' => $task->cancelled_at,
            'fulfilled_by_health_record_id' => $task->fulfilled_by_health_record_id,
            'health_record' => $this->recordSummary($task->healthRecord),
            'fulfilled_by_health_record' => $this->recordSummary(
                $task->fulfilledByHealthRecord
            ),
        ];
    }
}
