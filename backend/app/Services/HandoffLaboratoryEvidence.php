<?php

namespace App\Services;

use App\Models\LaboratoryAddendum;
use App\Models\LaboratoryAttachment;
use App\Models\LaboratoryTest;
use App\Models\MonitoringHandoffRequest;
use App\Models\PatientCondition;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class HandoffLaboratoryEvidence
{
    private const VISIBLE_STATUSES = ['pending_review', 'accepted_awaiting_first_visit', 'monitoring_active'];

    public function authorizeReceiver(User $user, MonitoringHandoffRequest $handoff): void
    {
        ActionPermissions::ensure($user, 'clinical.history');
        app(FacilityAccessService::class)->ensureValidFacilityAssignment($user);
        abort_unless($user->isBhc()
            && (int) $handoff->receiving_barangay_health_center_id === (int) $user->barangay_health_center_id
            && in_array($handoff->status, self::VISIBLE_STATUSES, true)
            && $handoff->linkedPatient
            && $handoff->linkedPatient->status !== 'inactive'
            && (int) $handoff->linkedPatient->barangay_health_center_id === (int) $user->barangay_health_center_id, 403);
    }

    public function authorizeSender(User $user, MonitoringHandoffRequest $handoff): void
    {
        ActionPermissions::ensure($user, 'consultations.finalize');
        app(LaboratoryEvidenceService::class)->authorizeRead($user, $handoff->healthRecord);
        abort_unless($user->isRhu()
            && (int) $handoff->sending_rural_health_unit_id === (int) $user->rural_health_unit_id
            && in_array($handoff->status, [...self::VISIBLE_STATUSES, 'linkage_needed'], true)
            && in_array($handoff->patientCondition?->status, PatientCondition::MONITORABLE_STATUSES, true), 403);
    }

    public function share(Request $request, MonitoringHandoffRequest $handoff, array $selected, bool $confirmed, ?string $reason = null): void
    {
        if ($selected !== [] && ! $confirmed) {
            throw ValidationException::withMessages(['laboratoryEvidenceConfirmed' => ['Confirm the selected laboratory evidence before sharing.']]);
        }
        // Every row pins one existing version and explicit attachment IDs.
        // Sort references for a consistent lock order across handoffs.
        usort($selected, fn ($a, $b) => strcmp($a['reference'], $b['reference']));
        $seen = [];
        $rows = [];
        foreach ($selected as $selection) {
            $reference = $selection['reference'];
            if (str_starts_with($reference, 'current:')) {
                $test = LaboratoryTest::query()->where('health_record_id', $handoff->health_record_id)
                    ->where('client_id', strtolower(substr($reference, 8)))->lockForUpdate()->first();
            } elseif (preg_match('/^record:(\d+)$/', $reference, $match)) {
                $test = LaboratoryTest::query()->whereKey($match[1])->lockForUpdate()->first();
            } else {
                $test = null;
            }
            if (! $test || (int) $test->patient_id !== (int) $handoff->patient_id
                || isset($seen[$test->id])
                || (int) $test->healthRecord->rural_health_unit_id !== (int) $handoff->sending_rural_health_unit_id) {
                throw ValidationException::withMessages(['laboratoryEvidence' => ['Select laboratory records belonging to this patient and sending RHU.']]);
            }
            app(LaboratoryEvidenceService::class)->authorizeRead($request->user(), $test->healthRecord);
            $latest = $test->addenda()->max('id') ?? 0;
            if ((int) $latest !== (int) $selection['version']) {
                throw ValidationException::withMessages(['laboratoryEvidence' => ['Laboratory evidence has changed. Review it and confirm sharing again.']]);
            }
            $seen[$test->id] = true;
            $attachmentIds = LaboratoryAttachment::query()
                ->where('health_record_id', $test->health_record_id)->where('test_client_id', $test->client_id)
                ->whereNull('removed_at')->whereNotNull('uploaded_at')->orderBy('id')->pluck('id')->all();
            $reviewedIds = $selection['attachmentIds'] ?? [];
            sort($reviewedIds);
            if ($reviewedIds !== $attachmentIds) {
                throw ValidationException::withMessages(['laboratoryEvidence' => ['Supporting attachments have changed. Review the evidence and confirm sharing again.']]);
            }
            $rows[] = [
                'monitoring_handoff_request_id' => $handoff->id,
                'laboratory_test_id' => $test->id,
                'laboratory_addendum_id' => $latest ?: null,
                'attachment_ids' => json_encode($attachmentIds, JSON_THROW_ON_ERROR),
                'shared_by' => $request->user()->id, 'shared_at' => now(),
            ];
        }
        DB::table('monitoring_laboratory_evidence')->where('monitoring_handoff_request_id', $handoff->id)
            ->whereNull('withdrawn_at')->update(['withdrawn_at' => now()]);
        if ($rows !== []) {
            DB::table('monitoring_laboratory_evidence')->insert($rows);
        }
        $handoff->forceFill(['laboratory_evidence_revision' => $handoff->laboratory_evidence_revision + 1])->save();
        app(AuditLogger::class)->log($request, 'updated', 'monitoring_laboratory_evidence',
            'Explicit laboratory sharing for handoff '.$handoff->id.': '.implode(',', array_keys($seen)).($reason ? '. Reason: '.$reason : ''));
    }

    public function present(MonitoringHandoffRequest $handoff): array
    {
        return DB::table('monitoring_laboratory_evidence')->where('monitoring_handoff_request_id', $handoff->id)
            ->whereNull('withdrawn_at')->orderBy('id')->get()->map(function ($share) use ($handoff) {
                $test = LaboratoryTest::findOrFail($share->laboratory_test_id);
                $version = $share->laboratory_addendum_id ? LaboratoryAddendum::query()
                    ->where('laboratory_test_id', $test->id)->findOrFail($share->laboratory_addendum_id) : null;
                $files = LaboratoryAttachment::query()->whereIn('id', json_decode($share->attachment_ids, true))
                    ->where('patient_id', $test->patient_id)->where('health_record_id', $test->health_record_id)
                    ->where('test_client_id', $test->client_id)->get();

                return [
                    ...($version?->data ?? $test->data), 'recordId' => $test->id,
                    'healthRecordId' => $test->health_record_id, 'version' => $version?->id ?? 0,
                    'sharedAt' => $share->shared_at, 'sharedBy' => $share->shared_by,
                    'handoffId' => $handoff->id, 'attachments' => $files->all(),
                    'conditionId' => $handoff->patient_condition_id,
                    'conditionName' => $handoff->patientCondition?->condition_name,
                ];
            })->all();
    }

    public function allowsAttachment(MonitoringHandoffRequest $handoff, LaboratoryAttachment $attachment): bool
    {
        return DB::table('monitoring_laboratory_evidence')->where('monitoring_handoff_request_id', $handoff->id)
            ->whereNull('withdrawn_at')->get()->contains(fn ($share) => in_array($attachment->id, json_decode($share->attachment_ids, true), true)
                && LaboratoryTest::query()->whereKey($share->laboratory_test_id)
                    ->where('patient_id', $attachment->patient_id)->where('health_record_id', $attachment->health_record_id)
                    ->where('client_id', $attachment->test_client_id)->exists());
    }
}
