<?php

namespace App\Services;

use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\User;

class FollowUpTaskSyncService
{
    public function syncRecord(HealthRecord $record, ?User $user = null): void
    {
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
        if ($record->visit_type !== 'follow_up_visit' || ! $record->parent_health_record_id) {
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

    private function deleteUnfulfilledTask(HealthRecord $record): void
    {
        FollowUpTask::where('health_record_id', $record->id)
            ->whereNull('fulfilled_at')
            ->delete();
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

    private function followUpDate(HealthRecord $record): ?string
    {
        $monitoringData = $record->monitoring_data ?? [];
        $date = $monitoringData['followUpDate']
            ?? $monitoringData['follow_up_date']
            ?? null;

        return $date ?: null;
    }
}
