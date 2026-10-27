<?php

namespace App\Services;

use Illuminate\Support\Collection;

/** Explicit decisions for existing tasks; never new reporting diagnoses. */
final class ContinuedConcerns
{
    public const OUTCOMES = ['managed_at_bhc', 'bhc_follow_up', 'refer_to_rhu'];

    public static function refers(array $decisions): bool
    {
        return collect($decisions)->contains(fn ($item) => is_array($item) && ($item['careOutcome'] ?? null) === 'refer_to_rhu');
    }

    public static function validate($validator, array $selectedIds, array $decisions, array $schedules): void
    {
        $selected = array_unique(array_map('intval', $selectedIds));
        $decided = array_map(fn ($item) => (int) ($item['taskId'] ?? 0), array_filter($decisions, 'is_array'));
        if (array_diff($selected, $decided) || array_diff($decided, $selected)) {
            $validator->errors()->add('care_plan.continued_concerns', 'Choose a care outcome for every selected follow-up, and remove decisions for unlinked tasks.');
        }
        foreach ($decisions as $index => $decision) {
            if (! is_array($decision)) {
                continue;
            }
            $taskId = (int) ($decision['taskId'] ?? 0);
            $successors = array_values(array_filter($schedules, fn ($item) => $item['predecessor_task_id'] === $taskId));
            $returns = ($decision['careOutcome'] ?? null) === 'bhc_follow_up';
            if (($returns && count($successors) !== 1) || (! $returns && $successors !== [])) {
                $validator->errors()->add("care_plan.continued_concerns.$index.careOutcome", $returns
                    ? 'Schedule exactly one BHC follow-up for this concern with a date and reason.'
                    : 'This care outcome cannot also schedule a return for the same concern.');
            }
            // A continued return cannot simultaneously claim a newly reported entry.
            foreach ($successors as $successor) {
                if ($successor['source_entry_id'] !== null) {
                    $validator->errors()->add("care_plan.continued_concerns.$index.careOutcome", 'Keep this continued concern separate from new health problems.');
                }
            }
        }
        foreach ($schedules as $index => $schedule) {
            if (str_starts_with($schedule['purpose_key'], 'continued:') && $schedule['purpose_key'] !== 'continued:'.$schedule['predecessor_task_id']) {
                $validator->errors()->add("monitoring_data.followUpSchedules.$index.predecessorTaskId", 'Link this return to its selected follow-up task.');
            }
        }
    }

    /** Called only after facility-scoped task locks succeed, inside finalization. */
    public static function snapshot(array $decisions, Collection $tasks): array
    {
        $byId = $tasks->keyBy('id');

        return array_map(function (array $decision) use ($byId) {
            $task = $byId->get((int) $decision['taskId']);

            return [
                'taskId' => (int) $task->id,
                'careOutcome' => $decision['careOutcome'],
                'sourceHealthRecordId' => (int) $task->health_record_id,
                'purpose' => FollowUpSchedules::purposeForTask($task->purpose, $task->healthRecord?->monitoring_data ?? [], $task->purpose_key) ?: 'Follow-up visit',
            ];
        }, $decisions);
    }
}
