<?php

namespace App\Services;

use App\Models\ConditionMonitoring;
use App\Models\ConditionMonitoringVisit;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Applies a consultation's care plan to the patient's condition monitoring.
 * Called only from HealthRecordController::store(), inside its transaction,
 * after the ITR is created. Monitoring starts only from an RHU-confirmed
 * condition and never changes that condition's status.
 */
class ConditionMonitoringService
{
    public function __construct(private readonly ClinicalRegistry $registry) {}

    /**
     * @param  array<int, mixed>  $monitoringIds
     * @return Collection<int, ConditionMonitoring> keyed by id
     */
    public function lockContinued(Patient $patient, array $monitoringIds): Collection
    {
        $ids = array_values(array_map('intval', $monitoringIds));
        // Only this patient's rows are locked (another patient's id is never
        // locked, it just fails below), in id order so concurrent saves lock
        // in the same order.
        $locked = ConditionMonitoring::query()
            ->where('patient_id', $patient->id)
            ->whereIn('id', $ids)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        foreach ($ids as $index => $id) {
            $monitoring = $locked->get($id);
            // Legacy BHC Monitoring is reconciled by the RHU; a BHC visit never continues it.
            if ($monitoring !== null
                && (int) $monitoring->patient_id === (int) $patient->id
                && $monitoring->status === ConditionMonitoring::STATUS_ACTIVE
                && $monitoring->isLegacy()) {
                throw ValidationException::withMessages([
                    "care_plan.continued_monitoring_ids.$index" => 'This monitoring is pending RHU verification and cannot be continued.',
                ]);
            }
            if ($monitoring === null
                || (int) $monitoring->patient_id !== (int) $patient->id
                || $monitoring->status !== ConditionMonitoring::STATUS_ACTIVE) {
                throw ValidationException::withMessages([
                    "care_plan.continued_monitoring_ids.$index" => 'This monitored condition is no longer active for this patient. Reopen Start Consultation.',
                ]);
            }
        }

        return $locked;
    }

    /**
     * Locks the confirmed conditions this visit starts monitoring for, in id
     * order, and checks each is still startable. A condition can start only
     * while the RHU holds it Active or Controlled for this patient.
     *
     * @param  array<int, mixed>  $conditionIds
     * @return Collection<int, PatientCondition> keyed by id
     */
    public function lockStarting(Patient $patient, array $conditionIds, ?\App\Models\User $user = null): Collection
    {
        $ids = array_values(array_map('intval', $conditionIds));
        if ($ids === []) {
            return collect();
        }
        $locked = PatientCondition::query()
            ->whereIn('id', $ids)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        foreach ($ids as $index => $id) {
            $condition = $locked->get($id);
            $onThisPatient = $condition !== null && (int) $condition->patient_id === (int) $patient->id;
            $viaHandoff = $condition !== null && $user !== null
                ? app(MonitoringHandoffService::class)->startableHandoffFor($patient, $condition, $user)
                : null;
            if ($condition === null
                || ! in_array($condition->status, PatientCondition::MONITORABLE_STATUSES, true)
                || (! $onThisPatient && $viaHandoff === null)) {
                throw ValidationException::withMessages([
                    "care_plan.start_monitoring_condition_ids.$index" => 'This condition is not confirmed as Active or Controlled for this patient.',
                ]);
            }
            $alreadyMonitored = ConditionMonitoring::query()
                ->where('patient_id', $patient->id)
                ->where('condition_identity', $condition->condition_identity)
                ->where('status', ConditionMonitoring::STATUS_ACTIVE)
                ->exists();
            if ($alreadyMonitored) {
                throw ValidationException::withMessages([
                    "care_plan.start_monitoring_condition_ids.$index" => 'This condition is already monitored at BHC.',
                ]);
            }
            if ($user !== null) {
                app(MonitoringHandoffService::class)->assertStartAllowed($patient, $condition, $user, $index);
            }
        }

        return $locked;
    }

    /**
     * @param  Collection<int, ConditionMonitoring>  $continued  from lockContinued()
     * @param  Collection<int, PatientCondition>  $starting  from lockStarting()
     * @param  array<int, array{monitoring_id: int|string, reason: string}>  $stops
     * @param  array<int, int|string>  $referredIds  followed monitoring the visit refers to the RHU (it stays active)
     * @return Collection<int, ConditionMonitoring> active after this visit, started or continued by it
     */
    public function apply(Patient $patient, HealthRecord $record, Collection $continued, Collection $starting, array $stops, User $user, array $referredIds = []): Collection
    {
        $referredIds = array_map('intval', $referredIds);
        $stopReasons = [];
        foreach ($stops as $index => $stop) {
            $id = (int) $stop['monitoring_id'];
            if (! $continued->has($id)) {
                throw ValidationException::withMessages([
                    "care_plan.monitoring_stops.$index.monitoring_id" => 'Only a monitored condition continued in this consultation can be stopped.',
                ]);
            }
            $stopReasons[$id] = trim((string) $stop['reason']);
        }

        $activeAfter = collect();

        foreach ($starting->sortKeys() as $condition) {
            $monitoring = ConditionMonitoring::create([
                'patient_id' => $patient->id,
                'patient_condition_id' => $condition->id,
                'barangay_health_center_id' => $patient->barangay_health_center_id,
                'condition_key' => $this->conditionKey($condition),
                'condition_name' => $condition->condition_name,
                'condition_identity' => $condition->condition_identity,
                'status' => ConditionMonitoring::STATUS_ACTIVE,
                'started_health_record_id' => $record->id,
                'started_at' => $record->date_recorded ?? now(),
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);
            $this->history($monitoring, $record, ConditionMonitoringVisit::ACTION_STARTED, false);
            // The RHU's recommendation is acted on: it must not come back when this monitoring stops.
            $condition->update(['bhc_monitoring_recommended_at' => null, 'bhc_monitoring_recommended_by' => null]);
            app(MonitoringHandoffService::class)->markMonitoringActive($patient, $condition, $user);
            $activeAfter->put($monitoring->id, $monitoring);
        }

        foreach ($continued as $monitoring) {
            if (isset($stopReasons[$monitoring->id])) {
                $monitoring->update([
                    'status' => ConditionMonitoring::STATUS_STOPPED,
                    'stopped_health_record_id' => $record->id,
                    'stopped_at' => $record->date_recorded ?? now(),
                    'stop_reason' => $stopReasons[$monitoring->id],
                    'updated_by' => $user->id,
                ]);
                $this->history($monitoring, $record, ConditionMonitoringVisit::ACTION_STOPPED, false);

                continue;
            }
            $this->history($monitoring, $record, ConditionMonitoringVisit::ACTION_CONTINUED, in_array($monitoring->id, $referredIds, true));
            $activeAfter->put($monitoring->id, $monitoring);
        }

        return $activeAfter->values();
    }

    /**
     * Link scheduled returns to the monitored conditions they actually address.
     * A visit-level legacy task still links every addressed monitoring; independent
     * purpose keys only attach a monitoring when the key names it.
     */
    public function linkFollowUpTask(HealthRecord $record, Collection $monitorings): void
    {
        if ($monitorings->isEmpty()) {
            return;
        }
        $tasks = FollowUpTask::query()
            ->where('health_record_id', $record->id)
            ->whereNull('rescheduled_to_id')
            ->whereIn('state', FollowUpTask::ACTIVE_STATES)
            ->get();
        if ($tasks->isEmpty()) {
            return;
        }
        $ids = $monitorings->pluck('id');
        if ($tasks->count() === 1 && ($tasks->first()->purpose_key ?: 'visit') === 'visit') {
            $tasks->first()->conditionMonitorings()->syncWithoutDetaching($ids->all());
            return;
        }
        foreach ($tasks as $task) {
            $key = (string) $task->purpose_key;
            if (! str_starts_with($key, 'monitoring:')) {
                continue;
            }
            $monitoringId = (int) substr($key, strlen('monitoring:'));
            if ($ids->contains($monitoringId)) {
                $task->conditionMonitorings()->syncWithoutDetaching([$monitoringId]);
            }
        }
    }

    private function history(ConditionMonitoring $monitoring, HealthRecord $record, string $action, bool $referred): void
    {
        $monitoring->visits()->create([
            'health_record_id' => $record->id,
            'action' => $action,
            'referred' => $referred,
            'created_at' => now(),
        ]);
    }

    /** The registry key the Monitoring Details form is looked up by; null for a free-text condition. */
    private function conditionKey(PatientCondition $condition): ?string
    {
        return $this->registry->matchCondition($condition->condition_name)['key']
            ?? ($this->registry->isValidConditionKey($condition->condition_identity) ? $condition->condition_identity : null);
    }
}
