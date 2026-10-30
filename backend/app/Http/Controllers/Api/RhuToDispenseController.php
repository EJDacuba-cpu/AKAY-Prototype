<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthRecord;
use App\Services\ActionPermissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RhuToDispenseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user?->isRhu(), 403, 'Your current facility assignment does not permit this action.');
        ActionPermissions::ensure($user, 'items.dispense');
        $rhuId = (int) $user->rural_health_unit_id;
        abort_unless($rhuId > 0, 403, 'Your current facility assignment does not permit this action.');

        $rows = HealthRecord::query()
            ->with(['patient:id,first_name,middle_name,last_name'])
            ->withCount('dispensedMedicines')
            ->where('rural_health_unit_id', $rhuId)
            ->whereNotNull('finalized_at')
            ->orderByDesc('date_recorded')
            ->orderByDesc('id')
            ->get()
            ->filter(fn (HealthRecord $record) => $record->isRhuItrV1() && $record->prescriptionDisplayText() !== '')
            ->values()
            ->map(fn (HealthRecord $record) => [
                'id' => $record->id,
                'patientId' => $record->patient_id,
                'patientName' => $record->patient?->full_name ?: '',
                'visitDate' => optional($record->date_recorded)->toDateString(),
                'prescriptionText' => $record->prescriptionDisplayText(),
                'status' => $record->dispensed_medicines_count > 0 ? 'given' : 'pending',
            ]);

        return response()->json(['data' => $rows]);
    }
}
