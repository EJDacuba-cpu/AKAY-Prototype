<?php

namespace App\Services;

use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\ValidationException;

class FollowUpTaskSyncService
{
    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    public function lockTaskForProcessing(
        array $recordData,
        Patient $patient,
        User $user
    ): ?FollowUpTask {
        if (
            ($recordData['visit_type'] ?? null) !== 'follow_up_visit'
            || empty($recordData['parent_health_record_id'])
        ) {
            return null;
        }

        $taskId = $this->followUpTaskId($recordData['monitoring_data'] ?? []);
        if (
            $taskId === null
            || ! filter_var($taskId, FILTER_VALIDATE_INT)
            || (int) $taskId <= 0
        ) {
            $this->invalidTask();
        }

        $task = FollowUpTask::query()
            ->with('healthRecord')
            ->whereKey((int) $taskId)
            ->lockForUpdate()
            ->first();

        if (! $task) {
            $this->invalidTask();
        }

        $this->facilityAccess->authorizeFollowUpTask($user, $task);
        $this->assertTaskMatchesSubmission($task, $recordData, $patient);

        if (! $this->isProcessable($task)) {
            $this->alreadyProcessed($task);
        }

        return $task;
    }

    public function lockTaskForManagement(FollowUpTask $task, User $user): FollowUpTask
    {
        $lockedTask = FollowUpTask::query()
            ->with(['patient', 'healthRecord'])
            ->whereKey($task->id)
            ->lockForUpdate()
            ->firstOrFail();

        $this->facilityAccess->authorizeFollowUpTask($user, $lockedTask);

        if (! $this->isProcessable($lockedTask)) {
            $this->alreadyProcessed($lockedTask);
        }

        return $lockedTask;
    }

    public function syncRecord(
        HealthRecord $record,
        ?User $user = null,
        ?FollowUpTask $lockedTask = null
    ): void
    {
        if ($record->visit_type === 'follow_up_visit' && $record->parent_health_record_id) {
            $this->syncFollowUpVisit($record, $user, $lockedTask);
            return;
        }

        if ($record->needs_referral) {
            $this->cancelUnfulfilledTask($record, $user);
            return;
        }

        $status = $this->healthRecordStatus($record);
        $dueDate = $this->followUpDate($record);

        if ($status !== 'follow up required' || ! $dueDate) {
            $this->cancelUnfulfilledTask($record, $user);
            return;
        }

        $this->upsertTask(
            $record,
            $dueDate,
            $this->followUpTime($record),
            $user
        );
    }

    /**
     * Create or refresh the task a record schedules, without clobbering state the
     * task owns. A record only knows the date the clinician typed into the form;
     * reschedules, no-shows and notes live on the task and must survive a re-sync.
     */
    private function upsertTask(
        HealthRecord $record,
        string $dueDate,
        ?string $dueTime,
        ?User $user
    ): void {
        $existingTask = FollowUpTask::where('health_record_id', $record->id)->first();

        if (in_array($existingTask?->state, [
            FollowUpTask::STATE_FULFILLED,
            FollowUpTask::STATE_CANCELLED,
        ], true)) {
            return;
        }

        $attributes = [
            'patient_id' => $record->patient_id,
            'barangay_health_center_id' => $record->barangay_health_center_id,
            'state' => $existingTask?->state ?? FollowUpTask::STATE_PENDING,
            'created_by' => $record->created_by,
            'updated_by' => $user?->id,
        ];

        // A rescheduled task carries a date chosen in the Follow-ups module that the
        // record never learns about. Re-deriving it from the record would silently
        // undo the reschedule on the next list load.
        if ($existingTask === null || $existingTask->rescheduled_at === null) {
            $attributes['due_date'] = $dueDate;
            $attributes['due_time'] = $dueTime;
        }

        FollowUpTask::updateOrCreate(['health_record_id' => $record->id], $attributes);
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

    public function fulfillParentTask(
        HealthRecord $record,
        ?User $user = null,
        ?FollowUpTask $lockedTask = null
    ): void
    {
        if (
            $record->visit_type !== 'follow_up_visit'
            || ! $record->parent_health_record_id
            || $this->followUpDate($record)
        ) {
            return;
        }

        $task = $lockedTask ?? $this->matchingParentTask($record, $user);

        if ($task) {
            $this->fulfillTask($task, $record, $user);
        }
    }

    private function syncFollowUpVisit(
        HealthRecord $record,
        ?User $user = null,
        ?FollowUpTask $lockedTask = null
    ): void
    {
        // Both lookups resolve against the parent record, so neither can select the
        // chain task this record owns.
        $task = $lockedTask
            ?? $this->linkedFollowUpTask($record, $user)
            ?? $this->matchingParentTask($record, $user);
        $dueDate = $this->followUpDate($record);

        if ($task) {
            $this->fulfillTask($task, $record, $user);
        }

        if (! $dueDate) {
            $this->cancelUnfulfilledTask($record, $user);
            return;
        }

        $this->upsertTask(
            $record,
            $dueDate,
            $this->followUpTime($record),
            $user
        );
    }

    private function cancelUnfulfilledTask(
        HealthRecord $record,
        ?User $user
    ): void
    {
        FollowUpTask::where('health_record_id', $record->id)
            ->whereIn('state', FollowUpTask::ACTIVE_STATES)
            ->whereNull('fulfilled_at')
            ->update([
                'state' => FollowUpTask::STATE_CANCELLED,
                'cancelled_at' => now(),
                'updated_by' => $user?->id,
                'updated_at' => now(),
            ]);
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

        $isActive = in_array($task->state, FollowUpTask::ACTIVE_STATES, true)
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
                === (int) $task->barangay_health_center_id;

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
            ->whereIn('state', FollowUpTask::ACTIVE_STATES)
            ->whereNull('fulfilled_at')
            ->first();

        if (! $task) {
            return null;
        }

        $this->facilityAccess->authorizeFollowUpTask($user, $task);

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

    private function assertTaskMatchesSubmission(
        FollowUpTask $task,
        array $recordData,
        Patient $patient
    ): void {
        $isValid = (int) $task->patient_id === (int) $patient->id
            && (int) $task->health_record_id
                === (int) $recordData['parent_health_record_id']
            && (int) $task->barangay_health_center_id
                === (int) $patient->barangay_health_center_id
            && $task->healthRecord !== null
            && (int) $task->healthRecord->patient_id === (int) $patient->id
            && (int) $task->healthRecord->barangay_health_center_id
                === (int) $task->barangay_health_center_id;

        if (! $isValid) {
            $this->invalidTask();
        }
    }

    private function isProcessable(FollowUpTask $task): bool
    {
        return in_array($task->state, FollowUpTask::ACTIVE_STATES, true)
            && $task->fulfilled_at === null
            && $task->fulfilled_by_health_record_id === null;
    }

    private function followUpTaskId(array $monitoringData): mixed
    {
        return $monitoringData['followUpTaskId']
            ?? $monitoringData['follow_up_task_id']
            ?? $monitoringData['followUpId']
            ?? $monitoringData['follow_up_id']
            ?? null;
    }

    private function alreadyProcessed(FollowUpTask $task): never
    {
        throw new HttpResponseException(response()->json([
            'message' => 'This follow-up has already been processed through another health-record submission.',
            'code' => 'FOLLOW_UP_ALREADY_PROCESSED',
            'follow_up_task_id' => $task->id,
            'health_record_id' => $task->fulfilled_by_health_record_id,
        ], 409));
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

    private function followUpDate(HealthRecord $record): ?string
    {
        $monitoringData = $record->monitoring_data ?? [];
        $date = $monitoringData['followUpDate']
            ?? $monitoringData['follow_up_date']
            ?? null;

        return $date ?: null;
    }

    private function followUpTime(HealthRecord $record): ?string
    {
        $monitoringData = $record->monitoring_data ?? [];
        $time = $monitoringData['followUpTime']
            ?? $monitoringData['follow_up_time']
            ?? null;

        return $time ?: null;
    }

}
