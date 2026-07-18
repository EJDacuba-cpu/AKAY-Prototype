<?php

namespace App\Services;

use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\User;

class FollowUpTaskSyncService
{
    public function findActiveMatchingTask(Patient $patient, ?string $category): ?FollowUpTask
    {
        $normalizedCategory = $this->normalizeCategory($category);
        if (! $normalizedCategory) {
            return null;
        }

        return FollowUpTask::query()
            ->with('healthRecord')
            ->where('patient_id', $patient->id)
            ->whereIn('state', [
                FollowUpTask::STATE_PENDING,
                FollowUpTask::STATE_RESCHEDULED,
                FollowUpTask::STATE_NO_SHOW,
            ])
            ->whereNull('fulfilled_at')
            ->get()
            ->first(function (FollowUpTask $task) use ($normalizedCategory): bool {
                return $this->normalizeCategory($task->healthRecord?->category) === $normalizedCategory;
            });
    }

    public function syncRecord(HealthRecord $record, ?User $user = null): void
    {
        if ($record->visit_type === 'follow_up_visit' && $record->parent_health_record_id) {
            $this->syncFollowUpVisit($record, $user);
            return;
        }

        $status = $this->healthRecordStatus($record);
        $dueDate = $this->followUpDate($record);

        if ($status !== 'follow up required' || ! $dueDate) {
            $this->deleteUnfulfilledTask($record);
            return;
        }

        $existingTask = FollowUpTask::where('health_record_id', $record->id)->first();

        if ($existingTask?->state === FollowUpTask::STATE_FULFILLED) {
            return;
        }

        FollowUpTask::updateOrCreate(
            ['health_record_id' => $record->id],
            [
                'patient_id' => $record->patient_id,
                'barangay_health_center_id' => $record->barangay_health_center_id,
                'due_date' => $dueDate,
                'state' => $existingTask?->state ?? FollowUpTask::STATE_PENDING,
                'created_by' => $record->created_by,
                'updated_by' => $user?->id,
            ]
        );
    }

    public function syncEligibleRecordsForUser(User $user): void
    {
        $query = HealthRecord::query();

        if ($user->isBhw()) {
            $query->where('barangay_health_center_id', $user->barangay_health_center_id);
        } elseif ($user->isRhuStaff()) {
            $query->where('rural_health_unit_id', $user->rural_health_unit_id);
        }

        $query->chunkById(100, function ($records) use ($user): void {
            $records->each(fn (HealthRecord $record) => $this->syncRecord($record, $user));
        });
    }

    public function fulfillParentTask(HealthRecord $record, ?User $user = null): void
    {
        if (
            $record->visit_type !== 'follow_up_visit'
            || ! $record->parent_health_record_id
            || $this->followUpDate($record)
        ) {
            return;
        }

        FollowUpTask::where('health_record_id', $record->parent_health_record_id)
            ->whereNull('fulfilled_at')
            ->update([
                'state' => FollowUpTask::STATE_FULFILLED,
                'fulfilled_at' => now(),
                'fulfilled_by_health_record_id' => $record->id,
                'updated_by' => $user?->id,
            ]);
    }

    private function syncFollowUpVisit(HealthRecord $record, ?User $user = null): void
    {
        FollowUpTask::where('health_record_id', $record->id)
            ->whereNull('fulfilled_at')
            ->delete();

        $task = $this->linkedFollowUpTask($record)
            ?? FollowUpTask::where('health_record_id', $record->parent_health_record_id)
                ->where('patient_id', $record->patient_id)
                ->first();
        $dueDate = $this->followUpDate($record);

        if ($task && ! $task->fulfilled_at) {
            $task->update([
                'state' => FollowUpTask::STATE_FULFILLED,
                'fulfilled_at' => now(),
                'fulfilled_by_health_record_id' => $record->id,
                'updated_by' => $user?->id,
            ]);
        }

        if (! $dueDate) {
            return;
        }

        FollowUpTask::updateOrCreate(
            ['health_record_id' => $record->id],
            [
                'patient_id' => $record->patient_id,
                'barangay_health_center_id' => $record->barangay_health_center_id,
                'due_date' => $dueDate,
                'state' => FollowUpTask::STATE_PENDING,
                'fulfilled_at' => null,
                'fulfilled_by_health_record_id' => null,
                'no_show_at' => null,
                'rescheduled_at' => null,
                'created_by' => $record->created_by,
                'updated_by' => $user?->id,
            ]
        );
    }

    private function deleteUnfulfilledTask(HealthRecord $record): void
    {
        FollowUpTask::where('health_record_id', $record->id)
            ->whereNull('fulfilled_at')
            ->delete();
    }

    private function linkedFollowUpTask(HealthRecord $record): ?FollowUpTask
    {
        $monitoringData = $record->monitoring_data ?? [];
        $taskId = $monitoringData['followUpTaskId']
            ?? $monitoringData['follow_up_task_id']
            ?? $monitoringData['followUpId']
            ?? $monitoringData['follow_up_id']
            ?? null;

        if (! $taskId) {
            return null;
        }

        return FollowUpTask::query()
            ->whereKey($taskId)
            ->where('patient_id', $record->patient_id)
            ->first();
    }

    private function healthRecordStatus(HealthRecord $record): string
    {
        $monitoringData = $record->monitoring_data ?? [];
        $status = $monitoringData['followUpStatus']
            ?? $monitoringData['follow_up_status']
            ?? $monitoringData['status']
            ?? 'Routine Monitoring';

        return str_replace(['_', '-'], ' ', strtolower(trim($status)));
    }

    private function normalizeCategory(?string $category): string
    {
        $value = str_replace(['_', '-'], ' ', strtolower(trim((string) $category)));

        if ($value === '') return '';
        if (str_contains($value, 'immun') || str_contains($value, 'epi') || str_contains($value, 'child health')) {
            return 'immunization';
        }
        if (str_contains($value, 'maternal') || str_contains($value, 'prenatal')) {
            return 'maternal';
        }
        if (str_contains($value, 'family') || str_contains($value, 'planning')) {
            return 'family planning';
        }
        if (str_contains($value, 'hypertension') || str_contains($value, 'diabetic') || str_contains($value, 'diabetes') || str_contains($value, 'ncd')) {
            return 'hypertension diabetic monitoring';
        }
        if (str_contains($value, 'general') || str_contains($value, 'consult')) {
            return 'general consultation';
        }

        return $value;
    }

    private function followUpDate(HealthRecord $record): ?string
    {
        $monitoringData = $record->monitoring_data ?? [];
        $date = $monitoringData['followUpDate']
            ?? $monitoringData['follow_up_date']
            ?? null;

        return $date ?: null;
    }
}
