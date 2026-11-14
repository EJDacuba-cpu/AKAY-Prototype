<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthRecord;
use App\Models\RhuServiceUsageReconciliation;
use App\Services\ActionPermissions;
use App\Services\RhuServiceUsageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RhuToDispenseController extends Controller
{
    public function __construct(
        private readonly RhuServiceUsageService $serviceUsages,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user?->isRhu(), 403, 'Your current facility assignment does not permit this action.');
        ActionPermissions::ensure($user, 'items.dispense');
        $rhuId = (int) $user->rural_health_unit_id;
        abort_unless($rhuId > 0, 403, 'Your current facility assignment does not permit this action.');

        $prescriptionRows = HealthRecord::query()
            ->with(['patient:id,first_name,middle_name,last_name'])
            ->withCount('dispensedMedicines')
            ->where('rural_health_unit_id', $rhuId)
            ->whereNotNull('finalized_at')
            ->orderByDesc('date_recorded')
            ->orderByDesc('id')
            ->get()
            ->filter(fn (HealthRecord $record) => $record->isRhuItrV1() && $record->prescriptionDisplayText() !== '')
            ->values()
            ->map(function (HealthRecord $record) {
                $prescriptions = $record->structuredPrescriptionSummaries();

                return [
                    'id' => $record->id,
                    'kind' => 'prescription',
                    'healthRecordId' => $record->id,
                    'patientId' => $record->patient_id,
                    'patientName' => $record->patient?->full_name ?: '',
                    'visitDate' => optional($record->date_recorded)->toDateString(),
                    'source' => 'Prescription',
                    'sourceType' => 'PRESCRIPTION',
                    'itemSummary' => $record->prescriptionDisplayText(),
                    'prescriptionText' => $record->prescriptionDisplayText(),
                    'prescriptions' => $prescriptions,
                    'status' => $record->dispensed_medicines_count > 0 ? 'given' : 'pending',
                ];
            });

        $usageRows = RhuServiceUsageReconciliation::query()
            ->with([
                'patient:id,first_name,middle_name,last_name',
                'healthRecord:id,date_recorded',
            ])
            ->where('rural_health_unit_id', $rhuId)
            ->whereIn('reconciliation_status', [
                RhuServiceUsageReconciliation::STATUS_PENDING,
                RhuServiceUsageReconciliation::STATUS_NEEDS_REVIEW,
                RhuServiceUsageReconciliation::STATUS_RECONCILED,
                RhuServiceUsageReconciliation::STATUS_UNAVAILABLE,
            ])
            ->orderByDesc('administered_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (RhuServiceUsageReconciliation $usage) => $usage->toQueueArray());

        $rows = $prescriptionRows
            ->concat($usageRows)
            ->sortByDesc(fn (array $row) => [
                (string) ($row['visitDate'] ?? ''),
                (string) ($row['id'] ?? ''),
            ])
            ->values();

        return response()->json(['data' => $rows]);
    }

    public function confirmUsage(Request $request, RhuServiceUsageReconciliation $usage): JsonResponse
    {
        $data = $request->validate([
            'medicine_id' => ['required', 'integer', 'exists:medicines,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'unit' => ['nullable', 'string', 'max:50'],
            'remarks' => ['nullable', 'string', 'max:2000'],
            'allocations' => ['sometimes', 'array'],
            'allocations.*.expiry_group_id' => ['required', 'integer', 'min:1'],
            'allocations.*.quantity' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'override_reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $updated = $this->serviceUsages->confirmStockUsage($request, $usage, $data);

        return response()->json(['data' => $updated->toQueueArray()]);
    }

    public function markUsageNeedsReview(Request $request, RhuServiceUsageReconciliation $usage): JsonResponse
    {
        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $updated = $this->serviceUsages->markNeedsReview($request, $usage, $data['note'] ?? null);

        return response()->json(['data' => $updated->toQueueArray()]);
    }
}
