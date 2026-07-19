<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FollowUpTask;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\FollowUpNotificationService;
use App\Services\FollowUpTaskSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class FollowUpTaskController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    public function index(
        Request $request,
        FollowUpNotificationService $followUpNotifications,
        FollowUpTaskSyncService $followUpTasks
    )
    {
        abort_unless($request->user()->isBhw() || $request->user()->isAdmin(), 403);

        $followUpTasks->syncEligibleRecordsForUser($request->user());
        $followUpNotifications->notifyDueForUser($request->user());

        $query = $this->facilityAccess
            ->scopeFollowUpTasks(FollowUpTask::query(), $request->user())
            ->with(['patient', 'healthRecord.patient', 'fulfilledByHealthRecord'])
            ->latest('due_date');

        if ($state = $request->query('state')) {
            $query->where('state', $state);
        }

        return response()->json(['data' => $query->paginate($request->integer('per_page', 100))]);
    }

    public function markNoShow(
        Request $request,
        FollowUpTask $followUpTask,
        AuditLogger $auditLogger,
        FollowUpTaskSyncService $followUpTasks
    )
    {
        $data = $request->validate([
            'notes' => ['nullable', 'string'],
        ]);

        $followUpTask = DB::transaction(function () use (
            $request,
            $followUpTask,
            $followUpTasks,
            $data,
            $auditLogger
        ): FollowUpTask {
            $lockedTask = $followUpTasks->lockTaskForManagement($followUpTask, $request->user());
            $lockedTask->update([
                'state' => FollowUpTask::STATE_NO_SHOW,
                'notes' => $data['notes'] ?? $lockedTask->notes,
                'no_show_at' => now(),
                'updated_by' => $request->user()->id,
            ]);
            $auditLogger->log($request, 'no_show', 'follow_up_tasks', "Marked follow-up task {$lockedTask->id} as no-show.");

            return $lockedTask;
        });

        return response()->json(['data' => $followUpTask->fresh()->load(['patient', 'healthRecord.patient', 'fulfilledByHealthRecord'])]);
    }

    public function reschedule(
        Request $request,
        FollowUpTask $followUpTask,
        AuditLogger $auditLogger,
        FollowUpTaskSyncService $followUpTasks
    )
    {
        $data = $request->validate([
            'due_date' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
            'state' => ['nullable', Rule::in([FollowUpTask::STATE_PENDING, FollowUpTask::STATE_RESCHEDULED])],
        ]);

        $followUpTask = DB::transaction(function () use (
            $request,
            $followUpTask,
            $followUpTasks,
            $data,
            $auditLogger
        ): FollowUpTask {
            $lockedTask = $followUpTasks->lockTaskForManagement($followUpTask, $request->user());
            $lockedTask->update([
                'due_date' => $data['due_date'],
                'state' => $data['state'] ?? FollowUpTask::STATE_RESCHEDULED,
                'notes' => $data['notes'] ?? $lockedTask->notes,
                'rescheduled_at' => now(),
                'no_show_at' => null,
                'updated_by' => $request->user()->id,
            ]);
            $auditLogger->log($request, 'rescheduled', 'follow_up_tasks', "Rescheduled follow-up task {$lockedTask->id}.");

            return $lockedTask;
        });

        return response()->json(['data' => $followUpTask->fresh()->load(['patient', 'healthRecord.patient', 'fulfilledByHealthRecord'])]);
    }

}
