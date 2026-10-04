<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConditionMonitoring;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\PatientConditionEvent;
use App\Services\FacilityAccessService;
use App\Services\PatientBackground;
use Illuminate\Http\Request;

/**
 * The RHU-confirmed conditions of a patient with their status history, plus the
 * active BHC monitorings not linked to any confirmed condition (legacy).
 */
class PatientConditionController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess) {}

    public function index(Request $request, Patient $patient)
    {
        $this->facilityAccess->authorizePatient($request->user(), $patient);
        abort_unless(PatientBackground::canAccess($request->user()), 403, 'Clinical history is restricted for your role.');

        $conditions = PatientCondition::query()
            ->with([
                'confirmedBy:id,name',
                'events' => fn ($q) => $q->with('changedBy:id,name')->orderByDesc('changed_at')->orderByDesc('id'),
                'monitorings' => fn ($q) => $q->where('status', ConditionMonitoring::STATUS_ACTIVE),
            ])
            ->where('patient_id', $patient->id)
            ->orderByDesc('confirmed_at')
            ->orderByDesc('id')
            ->get();

        $legacy = ConditionMonitoring::query()
            ->where('patient_id', $patient->id)
            ->where('status', ConditionMonitoring::STATUS_ACTIVE)
            ->whereNull('patient_condition_id')
            ->orderBy('started_at')
            ->get();

        return response()->json(['data' => [
            'conditions' => $conditions->map(function (PatientCondition $condition) {
                $monitoring = $condition->monitorings->first();

                return [
                    'id' => $condition->id,
                    'condition_name' => $condition->condition_name,
                    'condition_identity' => $condition->condition_identity,
                    'status' => $condition->status,
                    'confirmed_at' => $condition->confirmed_at?->toISOString(),
                    'confirmed_by_name' => $condition->confirmedBy?->name,
                    'source_type' => $condition->source_type,
                    'source_id' => $condition->source_id,
                    'bhc_monitoring_recommended_at' => $condition->bhc_monitoring_recommended_at?->toISOString(),
                    'monitoring' => $monitoring === null ? null : [
                        'id' => $monitoring->id,
                        'started_at' => $monitoring->started_at?->toDateString(),
                    ],
                    'events' => $condition->events->map(fn (PatientConditionEvent $event) => [
                        'from_status' => $event->from_status,
                        'to_status' => $event->to_status,
                        'note' => $event->note,
                        'source_type' => $event->source_type,
                        'source_id' => $event->source_id,
                        'changed_by_name' => $event->changedBy?->name,
                        'changed_at' => $event->changed_at?->toISOString(),
                    ])->values(),
                ];
            })->values(),
            'legacy_monitorings' => $legacy->map(fn (ConditionMonitoring $m) => [
                'id' => $m->id,
                'condition_name' => $m->condition_name,
                'condition_key' => $m->condition_key,
                'condition_identity' => $m->condition_identity,
                'started_at' => $m->started_at?->toDateString(),
            ])->values(),
        ]]);
    }
}
