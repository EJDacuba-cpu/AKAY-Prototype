<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FollowUpTask;
use App\Models\Patient;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\FollowUpTaskSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class FollowUpTaskController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    public function index(Request $request)
    {
        abort_unless($request->user()->isBhw() || $request->user()->isAdmin(), 403);
        $data = $request->validate([
            'patient_id' => ['nullable', 'integer', 'exists:patients,id'],
            'active' => ['nullable', 'boolean'],
            'state' => ['nullable', Rule::in([
                ...FollowUpTask::ACTIVE_STATES,
                FollowUpTask::STATE_FULFILLED,
                FollowUpTask::STATE_CANCELLED,
            ])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        // Decision A1 - the No-Show transition and its notification used to
        // run here as a side effect of this GET request
        // (FollowUpNotificationService::notifyDueForUser()). It now runs
        // only from the follow-ups:mark-no-show scheduled command, off this
        // read path entirely - see FollowUpNotificationService::sweep().

        $query = $this->facilityAccess
            ->scopeFollowUpTasks(FollowUpTask::query(), $request->user())
            // Part A.1.2 / B.3: the list is an action queue, not a timeline -
            // a superseded (rescheduled-away) row is history, not something
            // still to act on. Only the current row per health_record_id
            // qualifies; see the /follow-up-tasks/calendar endpoint for the
            // full history including superseded rows.
            ->whereNull('rescheduled_to_id')
            ->with([
                'patient',
                // Nested to cover realistic follow-up chain depth so
                // FollowUpTask::getOriginalHealthRecordIdAttribute() can walk back
                // to the original consultation without N+1 queries.
                'healthRecord.patient',
                'healthRecord.parentRecord.parentRecord.parentRecord.parentRecord',
                'fulfilledByHealthRecord',
                'practitioner',
            ])
            ->orderBy('due_date')
            ->orderBy('due_time')
            ->orderBy('id');

        if (! empty($data['patient_id'])) {
            $patient = Patient::findOrFail($data['patient_id']);
            $this->facilityAccess->authorizePatient($request->user(), $patient);
            $query->where('patient_id', $patient->id);
        }

        if ($request->boolean('active')) {
            $query
                ->whereIn('state', FollowUpTask::ACTIVE_STATES)
                ->whereNull('fulfilled_at')
                ->whereNull('fulfilled_by_health_record_id');
        } elseif ($state = $data['state'] ?? null) {
            $query->where('state', $state);
        }

        if (! empty($data['patient_id']) && $request->boolean('active')) {
            return response()->json(['data' => $query->get()]);
        }

        return response()->json([
            'data' => $query->paginate($data['per_page'] ?? 100),
        ]);
    }

    /**
     * Part A.4/B.3: the Calendar is a day-by-day timeline, not an action
     * queue - unlike index() it does NOT filter out superseded
     * (rescheduled-away) rows, and unlike index() it is not paginated: it
     * groups every task due within the range by due_date so the frontend can
     * render a month/week/day grid directly. Kept as its own endpoint rather
     * than a mode on index() because the two have genuinely different
     * filtering and response shapes, the same reasoning already applied to
     * keeping the notification counts endpoint separate from the
     * notification list endpoint.
     */
    public function calendar(Request $request)
    {
        abort_unless($request->user()->isBhw() || $request->user()->isAdmin(), 403);
        $data = $request->validate([
            'start' => ['required', 'date'],
            'end' => ['required', 'date', 'after_or_equal:start'],
        ]);

        $tasks = $this->facilityAccess
            ->scopeFollowUpTasks(FollowUpTask::query(), $request->user())
            ->whereBetween('due_date', [$data['start'], $data['end']])
            ->with([
                'patient',
                'healthRecord.patient',
                'healthRecord.parentRecord.parentRecord.parentRecord.parentRecord',
                'fulfilledByHealthRecord',
                'practitioner',
            ])
            ->orderBy('due_time')
            ->orderBy('id')
            ->get();

        $byDay = $tasks
            ->groupBy(fn (FollowUpTask $task) => $task->due_date->toDateString())
            ->map(fn ($dayTasks) => $dayTasks->values());

        return response()->json(['data' => $byDay]);
    }

    public function show(Request $request, FollowUpTask $followUpTask)
    {
        abort_unless($request->user()->isBhw() || $request->user()->isAdmin(), 403);
        $this->facilityAccess->authorizeFollowUpTask($request->user(), $followUpTask);

        return response()->json([
            'data' => $followUpTask->load($this->relations()),
        ]);
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

        return response()->json(['data' => $followUpTask->fresh()->load(['patient', 'healthRecord.patient', 'fulfilledByHealthRecord', 'practitioner'])]);
    }

    /**
     * Part B.1 of the Follow-up Module plan: a reschedule creates a new task
     * row rather than mutating due_date on the old one, so the old row's
     * original due date never moves (Part A.5 Principle 4) and the Calendar
     * can keep showing it on that original date (Part A.4.4). The response
     * is the NEW task - the one the frontend should now treat as active.
     */
    public function reschedule(
        Request $request,
        FollowUpTask $followUpTask,
        AuditLogger $auditLogger,
        FollowUpTaskSyncService $followUpTasks
    )
    {
        $data = $request->validate([
            'due_date' => ['required', 'date'],
            'due_time' => ['nullable', 'date_format:H:i'],
            'notes' => ['nullable', 'string'],
        ]);

        $newTask = DB::transaction(function () use (
            $request,
            $followUpTask,
            $followUpTasks,
            $data,
            $auditLogger
        ): FollowUpTask {
            $oldTask = $followUpTasks->lockTaskForManagement($followUpTask, $request->user());

            // The partial unique index keys on (health_record_id) WHERE
            // rescheduled_to_id IS NULL. Until $oldTask is pointed at the new
            // row, both rows would momentarily satisfy that condition for the
            // same health_record_id, so point it at itself first - a
            // trivially valid self-reference - to free the slot before
            // inserting. Corrected to the real new task id below; this
            // placeholder never persists outside the transaction.
            $oldTask->update(['rescheduled_to_id' => $oldTask->id]);

            $newTask = FollowUpTask::create([
                'health_record_id' => $oldTask->health_record_id,
                'patient_id' => $oldTask->patient_id,
                'barangay_health_center_id' => $oldTask->barangay_health_center_id,
                'due_date' => $data['due_date'],
                'due_time' => $data['due_time'] ?? null,
                'state' => FollowUpTask::STATE_RESCHEDULED,
                'notes' => $data['notes'] ?? null,
                'practitioner_id' => $oldTask->practitioner_id,
                'rescheduled_at' => now(),
                'created_by' => $oldTask->created_by,
                'updated_by' => $request->user()->id,
            ]);

            $oldTask->update([
                // A task already No-Show is terminal and already carries the
                // correct "missed" visual treatment; only a still-open task
                // (Pending) needs to flip to Rescheduled to mark it
                // superseded-not-missed.
                'state' => $oldTask->state === FollowUpTask::STATE_NO_SHOW
                    ? FollowUpTask::STATE_NO_SHOW
                    : FollowUpTask::STATE_RESCHEDULED,
                'rescheduled_to_id' => $newTask->id,
                'updated_by' => $request->user()->id,
            ]);

            $auditLogger->log(
                $request,
                'rescheduled',
                'follow_up_tasks',
                "Rescheduled follow-up task {$oldTask->id} to new task {$newTask->id}."
            );

            return $newTask;
        });

        return response()->json(['data' => $newTask->fresh()->load(['patient', 'healthRecord.patient', 'fulfilledByHealthRecord', 'practitioner'])]);
    }

    public function cancel(
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
            $lockedTask = $followUpTasks->lockTaskForManagement(
                $followUpTask,
                $request->user()
            );
            $lockedTask->update([
                'state' => FollowUpTask::STATE_CANCELLED,
                'notes' => $data['notes'] ?? $lockedTask->notes,
                'cancelled_at' => now(),
                'no_show_at' => null,
                'updated_by' => $request->user()->id,
            ]);
            $auditLogger->log(
                $request,
                'cancelled',
                'follow_up_tasks',
                "Cancelled follow-up task {$lockedTask->id}."
            );

            return $lockedTask;
        });

        return response()->json([
            'data' => $followUpTask->fresh()->load($this->relations()),
        ]);
    }

    private function relations(): array
    {
        return [
            'patient',
            'healthRecord.patient',
            'healthRecord.parentRecord.parentRecord.parentRecord.parentRecord',
            'fulfilledByHealthRecord',
            'practitioner',
        ];
    }
}
