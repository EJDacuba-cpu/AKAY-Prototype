<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FollowUpTask;
use App\Services\AuditLogger;
use App\Services\FollowUpNotificationService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class FollowUpTaskController extends Controller
{
    public function index(Request $request, FollowUpNotificationService $followUpNotifications)
    {
        abort_unless($request->user()->isBhw() || $request->user()->isAdmin(), 403);

        $followUpNotifications->notifyDueForUser($request->user());

        $query = FollowUpTask::query()
            ->with(['patient', 'healthRecord.patient', 'fulfilledByHealthRecord'])
            ->latest('due_date');

        if ($request->user()->isBhw()) {
            $query->where('barangay_health_center_id', $request->user()->barangay_health_center_id);
        }

        if ($state = $request->query('state')) {
            $query->where('state', $state);
        }

        return response()->json(['data' => $query->paginate($request->integer('per_page', 100))]);
    }

    public function markNoShow(Request $request, FollowUpTask $followUpTask, AuditLogger $auditLogger)
    {
        $this->authorizeTask($request, $followUpTask);

        $data = $request->validate([
            'notes' => ['nullable', 'string'],
        ]);

        $followUpTask->update([
            'state' => FollowUpTask::STATE_NO_SHOW,
            'notes' => $data['notes'] ?? $followUpTask->notes,
            'no_show_at' => now(),
            'updated_by' => $request->user()->id,
        ]);

        $auditLogger->log($request, 'no_show', 'follow_up_tasks', "Marked follow-up task {$followUpTask->id} as no-show.");

        return response()->json(['data' => $followUpTask->fresh()->load(['patient', 'healthRecord.patient', 'fulfilledByHealthRecord'])]);
    }

    public function reschedule(Request $request, FollowUpTask $followUpTask, AuditLogger $auditLogger)
    {
        $this->authorizeTask($request, $followUpTask);

        $data = $request->validate([
            'due_date' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
            'state' => ['nullable', Rule::in([FollowUpTask::STATE_PENDING, FollowUpTask::STATE_RESCHEDULED])],
        ]);

        $followUpTask->update([
            'due_date' => $data['due_date'],
            'state' => $data['state'] ?? FollowUpTask::STATE_RESCHEDULED,
            'notes' => $data['notes'] ?? $followUpTask->notes,
            'rescheduled_at' => now(),
            'no_show_at' => null,
            'updated_by' => $request->user()->id,
        ]);

        $auditLogger->log($request, 'rescheduled', 'follow_up_tasks', "Rescheduled follow-up task {$followUpTask->id}.");

        return response()->json(['data' => $followUpTask->fresh()->load(['patient', 'healthRecord.patient', 'fulfilledByHealthRecord'])]);
    }

    private function authorizeTask(Request $request, FollowUpTask $followUpTask): void
    {
        $allowed = $request->user()->isAdmin()
            || ($request->user()->isBhw() && $followUpTask->barangay_health_center_id === $request->user()->barangay_health_center_id);

        abort_unless($allowed, 403, 'Follow-up task is outside your assigned facility.');
    }
}
