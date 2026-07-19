<?php

namespace App\Services;

use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class FollowUpTaskSyncService
{
    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    public function findActiveMatchingTask(
        Patient $patient,
        ?string $category,
        User $user
    ): ?FollowUpTask
    {
        $this->facilityAccess->authorizePatientModification($user, $patient);
        $normalizedCategory = $this->normalizeCategory($category);
        if (! $normalizedCategory || $user->isRhuStaff()) {
            return null;
        }

        $query = FollowUpTask::query()
            ->with('healthRecord')
            ->where('patient_id', $patient->id)
            ->whereIn('state', [
                FollowUpTask::STATE_PENDING,
                FollowUpTask::STATE_RESCHEDULED,
                FollowUpTask::STATE_NO_SHOW,
            ])
            ->whereNull('fulfilled_at');

        if ($user->isBhw()) {
            $query->where('barangay_health_center_id', $user->barangay_health_center_id);
        }

        return $query
            ->get()
            ->first(function (FollowUpTask $task) use ($normalizedCategory, $patient): bool {
                return (int) $task->healthRecord?->patient_id === (int) $patient->id
                    && (int) $task->healthRecord?->barangay_health_center_id
                        === (int) $task->barangay_health_center_id
                    && $this->normalizeCategory($task->healthRecord?->category)
                        === $normalizedCategory;
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
        $this->facilityAccess->ensureValidFacilityAssignment($user);
        $query = $this->facilityAccess->scopeHealthRecords(
            HealthRecord::query(),
            $user
        );

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

        $task = $this->matchingParentTask($record, $user);

        if ($task) {
            $this->fulfillTask($task, $record, $user);
        }
    }

    private function syncFollowUpVisit(HealthRecord $record, ?User $user = null): void
    {
        FollowUpTask::where('health_record_id', $record->id)
            ->whereNull('fulfilled_at')
            ->delete();

        $task = $this->linkedFollowUpTask($record, $user)
            ?? $this->matchingParentTask($record, $user);
        $dueDate = $this->followUpDate($record);

        if ($task) {
            $this->fulfillTask($task, $record, $user);
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

    private function linkedFollowUpTask(
        HealthRecord $record,
        ?User $user
    ): ?FollowUpTask
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

        if (! filter_var($taskId, FILTER_VALIDATE_INT) || (int) $taskId <= 0) {
            $this->invalidTask();
        }

        $task = FollowUpTask::query()
            ->with('healthRecord')
            ->find($taskId);

        if (! $task) {
            $this->invalidTask();
        }

        abort_unless($user, 403, 'A valid facility assignment is required for clinical access.');
        $this->facilityAccess->authorizeFollowUpTask($user, $task);

        $activeStates = [
            FollowUpTask::STATE_PENDING,
            FollowUpTask::STATE_RESCHEDULED,
            FollowUpTask::STATE_NO_SHOW,
        ];
        $isActive = in_array($task->state, $activeStates, true)
            && $task->fulfilled_at === null;
        $isExistingFulfillment = $task->state === FollowUpTask::STATE_FULFILLED
            && $task->fulfilled_at !== null
            && (int) $task->fulfilled_by_health_record_id === (int) $record->id;
        $isValid = ($isActive || $isExistingFulfillment)
            && (int) $task->patient_id === (int) $record->patient_id
            && (int) $task->health_record_id === (int) $record->parent_health_record_id
            && (int) $task->barangay_health_center_id
                === (int) $record->barangay_health_center_id
            && $task->healthRecord !== null
            && (int) $task->healthRecord->patient_id === (int) $record->patient_id
            && (int) $task->healthRecord->barangay_health_center_id
                === (int) $task->barangay_health_center_id
            && $this->normalizeCategory($task->healthRecord->category)
                === $this->normalizeCategory($record->category);

        if (! $isValid) {
            $this->invalidTask();
        }

        return $task;
    }

    private function matchingParentTask(
        HealthRecord $record,
        ?User $user
    ): ?FollowUpTask
    {
        if (! $user || ! $record->parent_health_record_id) {
            return null;
        }

        $task = FollowUpTask::query()
            ->with('healthRecord')
            ->where('health_record_id', $record->parent_health_record_id)
            ->where('patient_id', $record->patient_id)
            ->where('barangay_health_center_id', $record->barangay_health_center_id)
            ->whereIn('state', [
                FollowUpTask::STATE_PENDING,
                FollowUpTask::STATE_RESCHEDULED,
                FollowUpTask::STATE_NO_SHOW,
            ])
            ->whereNull('fulfilled_at')
            ->first();

        if (! $task) {
            return null;
        }

        $this->facilityAccess->authorizeFollowUpTask($user, $task);

        if (
            $this->normalizeCategory($task->healthRecord?->category)
                !== $this->normalizeCategory($record->category)
        ) {
            return null;
        }

        return $task;
    }

    private function fulfillTask(
        FollowUpTask $task,
        HealthRecord $record,
        ?User $user
    ): void
    {
        if (
            $task->fulfilled_at !== null
            && (int) $task->fulfilled_by_health_record_id === (int) $record->id
        ) {
            return;
        }

        $task->update([
            'state' => FollowUpTask::STATE_FULFILLED,
            'fulfilled_at' => now(),
            'fulfilled_by_health_record_id' => $record->id,
            'updated_by' => $user?->id,
        ]);
    }

    private function invalidTask(): never
    {
        throw ValidationException::withMessages([
            'monitoring_data.followUpTaskId' => 'The linked follow-up task is not valid for this visit.',
        ]);
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
