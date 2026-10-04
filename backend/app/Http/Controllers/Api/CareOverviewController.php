<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Services\ActionPermissions;
use App\Services\FacilityAccessService;
use Illuminate\Http\Request;

/**
 * What the Start Consultation modal needs and nothing more: a patient's
 * pending follow-ups, the active monitoring that has no pending follow-up, and
 * RHU monitoring recommendations not yet acted on.
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
            ->with(['healthRecord:id,date_recorded,monitoring_data', 'conditionMonitorings' => fn ($q) => $q->with('patientCondition:id,status')->where('status', ConditionMonitoring::STATUS_ACTIVE)])
            ->where('patient_id', $patient->id)
            ->whereIn('state', FollowUpTask::ACTIVE_STATES)
            ->whereNull('fulfilled_at')
            ->whereNull('rescheduled_to_id')
            ->orderBy('due_date')
            ->get();

        $scheduledIds = $tasks->flatMap(fn (FollowUpTask $task) => $task->conditionMonitorings->pluck('id'))->unique();

        $monitorings = ConditionMonitoring::query()
            ->with(['patientCondition:id,status', 'visits' => fn ($q) => $q->with('healthRecord:id,date_recorded')->orderByDesc('id')])
            ->where('patient_id', $patient->id)
            ->where('status', ConditionMonitoring::STATUS_ACTIVE)
            ->whereNotIn('id', $scheduledIds)
            ->orderBy('started_at')
            ->get();

        // RHU-recommended conditions BHC has not started monitoring yet.
        $recommendations = PatientCondition::query()
            ->where('patient_id', $patient->id)
            ->whereIn('status', PatientCondition::MONITORABLE_STATUSES)
            ->whereNotNull('bhc_monitoring_recommended_at')
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('condition_monitorings')
                ->whereColumn('condition_monitorings.patient_id', 'patient_conditions.patient_id')
                ->whereColumn('condition_monitorings.condition_identity', 'patient_conditions.condition_identity')
                ->where('condition_monitorings.status', ConditionMonitoring::STATUS_ACTIVE))
            ->orderBy('bhc_monitoring_recommended_at')
            ->orderBy('id')
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
                    'condition_key' => $m->condition_key,
                    'started_at' => $m->started_at?->toDateString(),
                    'condition_status' => $m->patientCondition?->status,
                    'legacy' => $m->isLegacy(),
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
                    'condition_status' => $m->patientCondition?->status,
                    'legacy' => $m->isLegacy(),
                ];
            })->values(),
            'monitoring_recommendations' => $recommendations->map(fn (PatientCondition $c) => [
                'condition_id' => $c->id,
                'condition_name' => $c->condition_name,
                // Registry conditions use the key as identity; free-text ones are 'name:...'.
                'condition_key' => str_starts_with($c->condition_identity, 'name:') ? null : $c->condition_identity,
                'status' => $c->status,
                'confirmed_at' => $c->confirmed_at?->toISOString(),
                'recommended_at' => $c->bhc_monitoring_recommended_at?->toISOString(),
            ])->values(),
        ]]);
    }
}
