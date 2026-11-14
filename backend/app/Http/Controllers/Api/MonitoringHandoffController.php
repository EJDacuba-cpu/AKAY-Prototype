<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MonitoringHandoffRequest;
use App\Services\ActionPermissions;
use App\Services\HandoffLaboratoryEvidence;
use App\Services\MonitoringHandoffService;
use App\Services\PatientIdentity;
use Illuminate\Http\Request;

class MonitoringHandoffController extends Controller
{
    public function __construct(private readonly MonitoringHandoffService $handoffs) {}

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
            'identity_confirmed' => ['sometimes', 'boolean'],
            'verification_evidence' => ['nullable', 'string', 'max:500'],
        ]);
        $handoff = $this->handoffs->findForBhc($request->user(), $id);
        $handoff = $this->handoffs->link(
            $request,
            $handoff,
            (int) $data['linked_patient_id'],
            (bool) ($data['identity_confirmed'] ?? false),
            $data['verification_evidence'] ?? null,
        );

        return response()->json(['data' => $this->present($handoff->load([
            'patient', 'linkedPatient', 'patientCondition', 'sendingRuralHealthUnit', 'receivingBarangayHealthCenter', 'healthRecord',
        ]), true)]);
    }

    public function registerSource(Request $request, int $id)
    {
        $handoff = $this->handoffs->findForBhc($request->user(), $id);
        $handoff = $this->handoffs->registerSourceAtReceivingBhc($request, $handoff);

        return response()->json(['data' => $this->present($handoff->load([
            'patient', 'linkedPatient', 'patientCondition', 'sendingRuralHealthUnit', 'receivingBarangayHealthCenter', 'healthRecord',
        ]), true)]);
    }

    public function flagIdentityReview(Request $request, int $id)
    {
        $data = $request->validate([
            'note' => ['required', 'string', 'max:500'],
        ]);
        $handoff = $this->handoffs->findForBhc($request->user(), $id);
        $handoff = $this->handoffs->flagIdentityReview($request, $handoff, $data['note']);

        return response()->json(['data' => $this->present($handoff->load([
            'patient', 'linkedPatient', 'patientCondition', 'sendingRuralHealthUnit', 'receivingBarangayHealthCenter', 'healthRecord',
        ]), true)]);
    }

    public function resolveIdentityReview(Request $request, int $id)
    {
        $data = $request->validate([
            'note' => ['required', 'string', 'max:500'],
        ]);
        $handoff = $this->handoffs->findForBhc($request->user(), $id);
        $handoff = $this->handoffs->resolveIdentityReview($request, $handoff, $data['note']);

        return response()->json(['data' => $this->present($handoff->load([
            'patient', 'linkedPatient', 'patientCondition', 'sendingRuralHealthUnit', 'receivingBarangayHealthCenter', 'healthRecord',
        ]), true)]);
    }

    public function correctIdentityLink(Request $request, int $id)
    {
        $data = $request->validate([
            'note' => ['required', 'string', 'max:500'],
        ]);
        $handoff = $this->handoffs->findForBhc($request->user(), $id);
        $handoff = $this->handoffs->correctIdentityLink($request, $handoff, $data['note']);

        return response()->json(['data' => $this->present($handoff->load([
            'patient', 'linkedPatient', 'patientCondition', 'sendingRuralHealthUnit', 'receivingBarangayHealthCenter', 'healthRecord',
        ]), true)]);
    }

    public function sharedClinicalForPatient(Request $request, \App\Models\Patient $patient)
    {
        $rows = $this->handoffs->sharedClinicalFor($patient, $request->user());

        return response()->json(['data' => $rows->values()]);
    }

    public function accept(Request $request, int $id)
    {
        $handoff = $this->handoffs->findForBhc($request->user(), $id);
        $handoff = $this->handoffs->accept($request, $handoff);

        return response()->json(['data' => $this->present($handoff->load([
            'patient', 'linkedPatient', 'patientCondition', 'sendingRuralHealthUnit', 'receivingBarangayHealthCenter', 'healthRecord',
        ]), true)]);
    }

    public function decline(Request $request, int $id)
    {
        // BHC cannot decline Monitoring Requests; Accept-only workflow.
        abort(410, 'Monitoring requests can no longer be declined.');
    }

    /**
     * @return array<string, mixed>
     */
    private function present(MonitoringHandoffRequest $handoff, bool $detail): array
    {
        $source = $handoff->patient;
        $linked = $handoff->linkedPatient;
        $verifiedAtReceiving = $linked
            && (int) $linked->barangay_health_center_id === (int) $handoff->receiving_barangay_health_center_id;
        $identityVerified = $verifiedAtReceiving
            && in_array($handoff->status, [
                MonitoringHandoffRequest::STATUS_PENDING_REVIEW,
                MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT,
                MonitoringHandoffRequest::STATUS_MONITORING_ACTIVE,
            ], true);
        $payload = [
            'id' => $handoff->id,
            'status' => $handoff->status,
            'identity_source' => $handoff->identity_source,
            'identity_resolution' => $handoff->identity_resolution,
            'identity_resolution_note' => $handoff->identity_resolution_note,
            'verification_status' => $this->verificationStatus($handoff),
            // Recommendation is clinical — only after identity verification.
            'recommendation' => $identityVerified ? $handoff->recommendation : null,
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
            'handoff_kind' => $handoff->handoff_kind ?: MonitoringHandoffRequest::HANDOFF_KIND_CONDITION,
            'service_key' => $handoff->service_key,
            'service' => $handoff->isServiceHandoff() && $handoff->service_key
                ? [
                    'key' => $handoff->service_key,
                    'label' => match ($handoff->service_key) {
                        'Maternal' => 'Maternal Care',
                        'EPI' => 'EPI',
                        'Family Planning' => 'Family Planning',
                        'Nutrition' => 'Nutrition',
                        default => $handoff->service_key,
                    },
                ]
                : null,
            'condition' => $handoff->isServiceHandoff()
                ? null
                : [
                    'id' => $handoff->patient_condition_id,
                    'name' => $handoff->patientCondition?->condition_name,
                    'status' => $identityVerified ? $handoff->patientCondition?->status : null,
                ],
            'source_patient' => $source ? $this->identityPreview($source) : null,
            'linked_patient' => $linked ? PatientIdentity::response($linked, false) : null,
            'registration_status' => $handoff->status === MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED
                ? 'linkage_needed'
                : ($linked || ((int) $source?->barangay_health_center_id === (int) $handoff->receiving_barangay_health_center_id)
                    ? 'registered_at_receiving_bhc'
                    : 'rhu_only'),
            'requires_verification' => $handoff->status === MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED,
            'can_start_consultation' => $identityVerified
                && in_array($handoff->status, MonitoringHandoffRequest::STARTABLE_STATUSES, true)
                && ActionPermissions::allows(request()->user(), 'consultations.encode'),
        ];
        if ($detail) {
            $evidence = app(HandoffLaboratoryEvidence::class);
            $payload['laboratory_evidence'] = [];
            $payload['prescriptions'] = [];
            if (ActionPermissions::allows(request()->user(), 'clinical.history')
                && $identityVerified
                && $handoff->linkedPatient
                && $handoff->linkedPatient->status !== 'inactive'
                && (int) $handoff->linkedPatient->barangay_health_center_id === (int) request()->user()->barangay_health_center_id) {
                $evidence->authorizeReceiver(request()->user(), $handoff);
                $payload['laboratory_evidence'] = $evidence->present($handoff);
                $payload['prescriptions'] = $this->prescriptions($handoff);
            }
            $payload['health_record_id'] = $identityVerified ? $handoff->health_record_id : null;
            // Historical redirected rows remain readable; new redirects are disabled.
            $payload['redirected_to_bhc'] = $handoff->redirectedToBhc
                ? ['id' => $handoff->redirectedToBhc->id, 'name' => $handoff->redirectedToBhc->name]
                : null;
        }

        return $payload;
    }

    /**
     * Minimum authorized matching identity — no clinical payload.
     *
     * @return array<string, mixed>
     */
    private function identityPreview($patient): array
    {
        return [
            'id' => $patient->id,
            'first_name' => $patient->first_name,
            'middle_name' => $patient->middle_name,
            'last_name' => $patient->last_name,
            'suffix' => $patient->suffix,
            'full_name' => $patient->full_name,
            'birthdate' => $patient->birthdate?->format('Y-m-d'),
            'sex' => $patient->sex,
            'contact_number' => $patient->contact_number,
            'status' => $patient->status,
            'barangay_health_center_id' => $patient->barangay_health_center_id,
            'rural_health_unit_id' => $patient->rural_health_unit_id,
        ];
    }

    private function verificationStatus(MonitoringHandoffRequest $handoff): string
    {
        if ($handoff->identity_resolution === MonitoringHandoffRequest::IDENTITY_RESOLUTION_NEEDS_REVIEW) {
            return 'needs_review';
        }
        if ($handoff->status === MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED) {
            return 'awaiting_verification';
        }
        if ($handoff->linked_patient_id) {
            return 'verified';
        }

        return 'unknown';
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function prescriptions(MonitoringHandoffRequest $handoff): array
    {
        $record = $handoff->healthRecord;
        if (! $record) {
            return [];
        }
        $auth = is_array($record->monitoring_data['prescriptionAuthorization'] ?? null)
            ? $record->monitoring_data['prescriptionAuthorization']
            : null;
        if (! $auth) {
            return [];
        }

        return array_values(array_map(function (array $row) use ($auth) {
            return [
                'medicineName' => $row['medicineName'] ?? null,
                'strength' => $row['strength'] ?? null,
                'dose' => $row['dose'] ?? null,
                'route' => $row['route'] ?? null,
                'frequency' => $row['frequency'] ?? null,
                'duration' => $row['duration'] ?? null,
                'instructions' => $row['instructions'] ?? null,
                'authorizedQuantity' => $row['authorizedQuantity'] ?? null,
                'authorizedUnit' => $row['authorizedUnit'] ?? null,
                'line' => $row['line'] ?? null,
                'physicianName' => $auth['physicianName'] ?? null,
                'authorizedAt' => $auth['authorizedAt'] ?? null,
            ];
        }, $record->structuredPrescriptionSummaries()));
    }
}
