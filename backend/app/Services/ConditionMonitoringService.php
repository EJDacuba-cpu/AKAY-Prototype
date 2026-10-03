<?php

namespace App\Services;

use App\Models\ConditionMonitoring;
use App\Models\ConditionMonitoringVisit;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Applies a consultation's care plan to the patient's condition monitoring.
 * Called only from HealthRecordController::store(), inside its transaction,
 * after the ITR is created. Never touches Current Conditions.
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
     * @param  array<int, array<string, mixed>>  $diagnoses  server-resolved (conditionKey set)
     * @param  Collection<int, ConditionMonitoring>  $continued  from lockContinued()
     * @param  array<int, array{monitoring_id: int|string, reason: string}>  $stops
     * @param  array<int, int|string>  $referredIds  followed monitoring the visit refers to the RHU (it stays active)
     * @return Collection<int, ConditionMonitoring> active after this visit, started or continued by it
     */
    public function apply(Patient $patient, HealthRecord $record, array $diagnoses, Collection $continued, array $stops, User $user, array $referredIds = []): Collection
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

        // One entry per condition identity this visit monitors; a condition
        // typed twice ("HTN" Monitor, "Hypertension" Refer) collapses to one,
        // referred if any entry refers.
        $monitored = [];
        foreach ($diagnoses as $diagnosis) {
            if (! is_array($diagnosis) || ! CarePlan::monitors($diagnosis['carePlan'] ?? null)) {
                continue;
            }
            $identity = $this->registry->conditionIdentity($diagnosis['conditionKey'] ?? null, (string) $diagnosis['name']);
            $monitored[$identity] ??= ['key' => $diagnosis['conditionKey'] ?? null, 'name' => (string) $diagnosis['name'], 'referred' => $this->isReferred($diagnoses, $identity)];
        }

        $this->assertEndedConditionsAreStopped($diagnoses, $continued, $monitored, $stopReasons);
        // The existing-row lookups below take row locks: always in the same
        // (identity) order, whatever order the diagnoses were typed in.
        ksort($monitored, SORT_STRING);

        $activeAfter = collect();

        foreach ($monitored as $identity => $entry) {
            $existing = ConditionMonitoring::query()
                ->where('patient_id', $patient->id)
                ->where('condition_identity', $identity)
                ->where('status', ConditionMonitoring::STATUS_ACTIVE)
                ->lockForUpdate()
                ->first();

            if ($existing !== null && isset($stopReasons[$existing->id])) {
                // Monitor on the diagnosis row wins over a stale stop entry.
                unset($stopReasons[$existing->id]);
            }

            $monitoring = $existing ?? ConditionMonitoring::create([
                'patient_id' => $patient->id,
                'barangay_health_center_id' => $patient->barangay_health_center_id,
                'condition_key' => $entry['key'],
                'condition_name' => $entry['name'],
                'condition_identity' => $identity,
                'status' => ConditionMonitoring::STATUS_ACTIVE,
                'started_health_record_id' => $record->id,
                'started_at' => $record->date_recorded ?? now(),
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);

            $this->history($monitoring, $record, $existing === null ? ConditionMonitoringVisit::ACTION_STARTED : ConditionMonitoringVisit::ACTION_CONTINUED, $entry['referred'] || in_array($monitoring->id, $referredIds, true));
            $activeAfter->put($monitoring->id, $monitoring);
        }

        foreach ($continued as $monitoring) {
            if ($activeAfter->has($monitoring->id)) {
                continue;
            }
            if (isset($stopReasons[$monitoring->id])) {
                $monitoring->update([
                    'status' => ConditionMonitoring::STATUS_STOPPED,
                    'stopped_health_record_id' => $record->id,
                    'stopped_at' => $record->date_recorded ?? now(),
                    'stop_reason' => $stopReasons[$monitoring->id],
                    'updated_by' => $user->id,
                ]);
                $this->history($monitoring, $record, ConditionMonitoringVisit::ACTION_STOPPED, $this->isReferred($diagnoses, $monitoring->condition_identity));

                continue;
            }
            $this->history($monitoring, $record, ConditionMonitoringVisit::ACTION_CONTINUED, $this->isReferred($diagnoses, $monitoring->condition_identity) || in_array($monitoring->id, $referredIds, true));
            $activeAfter->put($monitoring->id, $monitoring);
        }

        return $activeAfter->values();
    }

    /** Links the visit's one follow-up task (if it scheduled one) to every monitored condition. */
    public function linkFollowUpTask(HealthRecord $record, Collection $monitorings): void
    {
        if ($monitorings->isEmpty()) {
            return;
        }
        $task = FollowUpTask::query()
            ->where('health_record_id', $record->id)
            ->whereNull('rescheduled_to_id')
            ->whereIn('state', FollowUpTask::ACTIVE_STATES)
            ->first();
        $task?->conditionMonitorings()->syncWithoutDetaching($monitorings->pluck('id')->all());
    }

    /**
     * A continued condition re-diagnosed this visit as No Ongoing Tracking
     * (none) ends monitoring, so it needs a stop with a reason. Refer to RHU
     * does not: a referral keeps the monitoring active and is tracked on its
     * own. An absent carePlan means "continue" (the UI default). Runs before
     * any write so the whole save rolls back.
     *
     * @param  array<int, array<string, mixed>>  $diagnoses
     * @param  Collection<int, ConditionMonitoring>  $continued
     * @param  array<string, mixed>  $monitored  identities monitored by a diagnosis this visit
     * @param  array<int, string>  $stopReasons
     */
    private function assertEndedConditionsAreStopped(array $diagnoses, Collection $continued, array $monitored, array $stopReasons): void
    {
        foreach ($continued as $monitoring) {
            if (isset($monitored[$monitoring->condition_identity]) || ($stopReasons[$monitoring->id] ?? '') !== '') {
                continue;
            }
            foreach ($diagnoses as $diagnosis) {
                if (is_array($diagnosis)
                    && ($diagnosis['carePlan'] ?? null) === CarePlan::NONE
                    && $this->registry->conditionIdentity($diagnosis['conditionKey'] ?? null, (string) ($diagnosis['name'] ?? '')) === $monitoring->condition_identity) {
                    throw ValidationException::withMessages([
                        'care_plan.monitoring_stops' => 'A continued condition marked No Ongoing Tracking must be stopped with a reason.',
                    ]);
                }
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

    /** Whether a diagnosis of this condition identity is referred this visit. */
    private function isReferred(array $diagnoses, string $identity): bool
    {
        foreach ($diagnoses as $diagnosis) {
            if (is_array($diagnosis)
                && CarePlan::refers($diagnosis['carePlan'] ?? null)
                && $this->registry->conditionIdentity($diagnosis['conditionKey'] ?? null, (string) ($diagnosis['name'] ?? '')) === $identity) {
                return true;
            }
        }

        return false;
    }
}
