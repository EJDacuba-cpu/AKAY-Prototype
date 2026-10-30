<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MonitoringHandoffService;
use App\Services\PatientIdentity;
use Illuminate\Http\Request;

class MonitoringHandoffController extends Controller
{
    public function __construct(private readonly MonitoringHandoffService $handoffs)
    {
    }

    public function catchmentBhcs(Request $request)
    {
        $centers = $this->handoffs->catchmentBhcs($request->user());

        return response()->json(['data' => array_map(fn ($bhc) => [
            'id' => $bhc->id,
            'name' => $bhc->name,
            'barangay' => $bhc->barangay,
        ], $centers)]);
    }

    public function index(Request $request)
    {
        $rows = $this->handoffs->listForBhc($request->user());

        return response()->json(['data' => $rows->map(fn ($handoff) => $this->present($handoff, false))->values()]);
    }

    public function show(Request $request, int $id)
    {
        $handoff = $this->handoffs->findForBhc($request->user(), $id);

        return response()->json(['data' => $this->present($handoff, true)]);
    }

    public function link(Request $request, int $id)
    {
        $data = $request->validate([
            'linked_patient_id' => ['required', 'integer', 'exists:patients,id'],
        ]);
        $handoff = $this->handoffs->findForBhc($request->user(), $id);
        $handoff = $this->handoffs->link($request, $handoff, (int) $data['linked_patient_id']);

        return response()->json(['data' => $this->present($handoff->load([
            'patient', 'linkedPatient', 'patientCondition', 'sendingRuralHealthUnit', 'receivingBarangayHealthCenter',
        ]), true)]);
    }

    public function accept(Request $request, int $id)
    {
        $handoff = $this->handoffs->findForBhc($request->user(), $id);
        $handoff = $this->handoffs->accept($request, $handoff);

        return response()->json(['data' => $this->present($handoff->load([
            'patient', 'linkedPatient', 'patientCondition', 'sendingRuralHealthUnit', 'receivingBarangayHealthCenter',
        ]), true)]);
    }

    public function decline(Request $request, int $id)
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
            'redirected_to_bhc_id' => ['nullable', 'integer', 'exists:barangay_health_centers,id'],
        ]);
        $handoff = $this->handoffs->findForBhc($request->user(), $id);
        $handoff = $this->handoffs->decline(
            $request,
            $handoff,
            $data['reason'],
            isset($data['redirected_to_bhc_id']) ? (int) $data['redirected_to_bhc_id'] : null
        );

        return response()->json(['data' => $this->present($handoff->load([
            'patient', 'linkedPatient', 'patientCondition', 'sendingRuralHealthUnit', 'receivingBarangayHealthCenter', 'redirectedToBhc',
        ]), true)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(\App\Models\MonitoringHandoffRequest $handoff, bool $detail): array
    {
        $source = $handoff->patient;
        $linked = $handoff->linkedPatient;
        $payload = [
            'id' => $handoff->id,
            'status' => $handoff->status,
            'recommendation' => $handoff->recommendation,
            'decline_reason' => $handoff->decline_reason,
            'created_at' => $handoff->created_at?->toISOString(),
            'reviewed_at' => $handoff->reviewed_at?->toISOString(),
            'sending_rhu' => [
                'id' => $handoff->sending_rural_health_unit_id,
                'name' => $handoff->sendingRuralHealthUnit?->name,
            ],
            'receiving_bhc' => [
                'id' => $handoff->receiving_barangay_health_center_id,
                'name' => $handoff->receivingBarangayHealthCenter?->name,
            ],
            'condition' => [
                'id' => $handoff->patient_condition_id,
                'name' => $handoff->patientCondition?->condition_name,
                'status' => $handoff->patientCondition?->status,
            ],
            'source_patient' => $source ? PatientIdentity::response($source, false) : null,
            'linked_patient' => $linked ? PatientIdentity::response($linked, false) : null,
            'registration_status' => $handoff->status === \App\Models\MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED
                ? 'linkage_needed'
                : ($linked || ((int) $source?->barangay_health_center_id === (int) $handoff->receiving_barangay_health_center_id)
                    ? 'registered_at_receiving_bhc'
                    : 'rhu_only'),
        ];
        if ($detail) {
            $payload['health_record_id'] = $handoff->health_record_id;
            $payload['redirected_to_bhc'] = $handoff->redirectedToBhc
                ? ['id' => $handoff->redirectedToBhc->id, 'name' => $handoff->redirectedToBhc->name]
                : null;
            $payload['catchment_bhcs'] = \App\Models\BarangayHealthCenter::query()
                ->where('rural_health_unit_id', $handoff->sending_rural_health_unit_id)
                ->where('status', 'active')
                ->whereKeyNot($handoff->receiving_barangay_health_center_id)
                ->orderBy('name')
                ->get(['id', 'name']);
        }

        return $payload;
    }
}
