<?php

namespace App\Services;

use App\Models\ConditionMonitoring;
use App\Models\ConditionMonitoringVisit;
use App\Models\Patient;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * The RHU discontinuing Legacy BHC Monitoring (active, no linked condition)
 * that it will not verify. Verifying is the other way out: confirming the same
 * condition links the row (PatientConditions). Runs inside the caller's
 * transaction, before confirmations, so a row being discontinued is never
 * auto-linked. History is kept - the row is stopped, never deleted or rewritten.
 */
class LegacyMonitoringReview
{
    /** The stop reason column holds 500 characters, including this prefix. */
    private const REASON_PREFIX = 'RHU review: ';

    public function __construct(private readonly AuditLogger $auditLogger) {}

    public static function rules(string $prefix = 'legacy_monitoring_discontinuations'): array
    {
        return [
            $prefix => ['nullable', 'array', 'max:20'],
            "{$prefix}.*.monitoring_id" => ['required', 'integer', 'distinct'],
            // 500 less the "RHU review: " prefix, so the stop reason always fits.
            "{$prefix}.*.reason" => ['required', 'string', 'max:'.(500 - strlen(self::REASON_PREFIX)), 'regex:/\S/'],
        ];
    }

    /**
     * @param  array<int, array{monitoring_id: int, reason: string}>  $items validated by rules()
     * @param  ?int  $healthRecordId the RHU record doing the review, or null from a feedback
     *                               (the visit table needs a record, so a feedback leaves only the audit row)
     * @return Collection<int, ConditionMonitoring> the stopped rows
     */
    public function discontinue(Request $request, Patient $patient, array $items, string $sourceType, int $sourceId, ?int $healthRecordId, string $prefix = 'legacy_monitoring_discontinuations'): Collection
    {
        $items = array_values($items);
        if ($items === []) {
            return new Collection;
        }

        // Same lock order as PatientConditions::apply: the patient first, then the rows by id.
        Patient::query()->whereKey($patient->id)->lockForUpdate()->firstOrFail();
        $rows = ConditionMonitoring::query()
            ->whereIn('id', array_column($items, 'monitoring_id'))
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        foreach ($items as $i => $item) {
            $row = $rows->get((int) $item['monitoring_id']);
            if ($row === null
                || $row->patient_id !== $patient->id
                || $row->status !== ConditionMonitoring::STATUS_ACTIVE
                || ! $row->isLegacy()) {
                throw ValidationException::withMessages([
                    "{$prefix}.{$i}.monitoring_id" => 'This monitoring is not a legacy monitoring pending RHU verification for this patient.',
                ]);
            }
        }

        $stopped = new Collection;
        foreach ($items as $item) {
            $row = $rows->get((int) $item['monitoring_id']);
            $reason = trim((string) $item['reason']);
            $now = now();

            $row->update([
                'status' => ConditionMonitoring::STATUS_STOPPED,
                'stopped_at' => $now,
                'stop_reason' => self::REASON_PREFIX.$reason,
                'stopped_health_record_id' => $healthRecordId,
                'updated_by' => $request->user()->id,
            ]);

            if ($healthRecordId !== null) {
                $row->visits()->create([
                    'health_record_id' => $healthRecordId,
                    'action' => ConditionMonitoringVisit::ACTION_STOPPED,
                    'referred' => false,
                    'created_at' => $now,
                ]);
            }

            $this->auditLogger->log(
                $request,
                'discontinued',
                'condition_monitorings',
                "Legacy BHC monitoring {$row->id} ({$row->condition_name}) discontinued by RHU review. Status: active (Legacy — Pending RHU Verification) -> stopped. Reason: {$reason}. Source: {$sourceType} #{$sourceId}."
            );
            $stopped->push($row);
        }

        return $stopped;
    }
}
