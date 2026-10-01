<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\Patient;
use App\Services\ActionPermissions;
use App\Services\FacilityAccessService;
use Illuminate\Http\Request;

/**
 * What the Start Consultation modal needs and nothing more: a patient's
 * pending follow-ups and the active monitoring that has no pending follow-up.
 * No ITR bodies, vitals, diagnosis lists or referral data.
 */
class CareOverviewController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess) {}

    public function show(Request $request, Patient $patient)
    {
        $user = $request->user();
        abort_unless(
            ActionPermissions::allows($user, 'consultations.encode') || ActionPermissions::allows($user, 'clinical.history'),
            403,
            'Your current facility assignment does not permit this action.'
        );
        $this->facilityAccess->authorizePatient($user, $patient);

        $tasks = FollowUpTask::query()
            ->with(['healthRecord:id,date_recorded,monitoring_data', 'conditionMonitorings' => fn ($q) => $q->where('status', ConditionMonitoring::STATUS_ACTIVE)])
            ->where('patient_id', $patient->id)
            ->whereIn('state', FollowUpTask::ACTIVE_STATES)
            ->whereNull('fulfilled_at')
            ->whereNull('rescheduled_to_id')
            ->orderBy('due_date')
            ->get();

        $scheduledIds = $tasks->flatMap(fn (FollowUpTask $task) => $task->conditionMonitorings->pluck('id'))->unique();

        $monitorings = ConditionMonitoring::query()
            ->with(['visits' => fn ($q) => $q->with('healthRecord:id,date_recorded')->orderByDesc('id')])
            ->where('patient_id', $patient->id)
            ->where('status', ConditionMonitoring::STATUS_ACTIVE)
            ->whereNotIn('id', $scheduledIds)
            ->orderBy('started_at')
            ->get();

        return response()->json(['data' => [
            'pending_follow_ups' => $tasks->map(fn (FollowUpTask $task) => [
                'id' => $task->id,
                'due_date' => $task->due_date?->toDateString(),
                'due_time' => $task->due_time,
                'state' => $task->state,
                'is_overdue' => $task->due_date !== null && $task->due_date->lt(today()),
                'reason' => $task->healthRecord?->monitoring_data['followUpReason']
                    ?? $task->healthRecord?->monitoring_data['follow_up_reason']
                    ?? null,
                'source_health_record_id' => $task->health_record_id,
                'source_date' => $task->healthRecord?->date_recorded?->toDateString(),
                'conditions' => $task->conditionMonitorings->map(fn (ConditionMonitoring $m) => [
                    'monitoring_id' => $m->id,
                    'condition_name' => $m->condition_name,
                ])->values(),
            ])->values(),
            'monitoring_without_follow_up' => $monitorings->map(function (ConditionMonitoring $m) {
                $last = $m->visits->first();

                return [
                    'id' => $m->id,
                    'condition_name' => $m->condition_name,
                    'condition_key' => $m->condition_key,
                    'started_at' => $m->started_at?->toDateString(),
                    'last_visit_date' => $last?->healthRecord?->date_recorded?->toDateString(),
                    'last_health_record_id' => $last?->health_record_id,
                ];
            })->values(),
        ]]);
    }
}
