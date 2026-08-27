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
                'due_time' => array_key_exists('due_time', $data)
                    ? $data['due_time']
                    : $lockedTask->due_time,
                'state' => $data['state'] ?? FollowUpTask::STATE_RESCHEDULED,
                'notes' => $data['notes'] ?? $lockedTask->notes,
                'rescheduled_at' => now(),
                'no_show_at' => null,
                'updated_by' => $request->user()->id,
            ]);
            $auditLogger->log($request, 'rescheduled', 'follow_up_tasks', "Rescheduled follow-up task {$lockedTask->id}.");

            return $lockedTask;
        });

        return response()->json(['data' => $followUpTask->fresh()->load(['patient', 'healthRecord.patient', 'fulfilledByHealthRecord', 'practitioner'])]);
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
