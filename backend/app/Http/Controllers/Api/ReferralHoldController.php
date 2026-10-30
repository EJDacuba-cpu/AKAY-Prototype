<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\ReferralHold;
use App\Services\ActionPermissions;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\ProviderAvailabilityService;
use App\Services\ReferralHoldService;
use App\Services\ReferralRoutingService;
use Illuminate\Http\Request;

class ReferralHoldController extends Controller
{
    public function store(Request $request, ReferralHoldService $holds)
    {
        $data = $request->validate([
            'patient_id' => ['required', 'integer', 'exists:patients,id'],
            'health_record_id' => ['nullable', 'integer', 'exists:health_records,id'],
            'rural_health_unit_id' => ['required', 'integer'],
        ]);
        $user = $request->user();
        $patient = Patient::findOrFail($data['patient_id']);
        $access = app(FacilityAccessService::class);
        $access->authorizePatientModification($user, $patient);
        if (! empty($data['health_record_id'])) {
            $record = HealthRecord::findOrFail($data['health_record_id']);
            $access->authorizeHealthRecord($user, $record);
            abort_unless((int) $record->patient_id === (int) $patient->id, 422, 'The consultation must belong to this patient.');
        }
        $route = app(ReferralRoutingService::class)->resolveForBhc($user, (int) $data['rural_health_unit_id']);
        abort_if(app(ProviderAvailabilityService::class)->availableCountForRhu($route['rhu']->id) > 0, 409, 'A doctor is now available. Review and submit the referral.');
        $hold = $holds->recordBlockedAttempt($user, $patient, $route['bhc']->id, $route['rhu'], $data);

        return response()->json(['data' => $hold->toWaitingArray()], 201);
    }

    public function index(Request $request)
    {
        ActionPermissions::ensure($request->user(), 'referrals.submit');

        $holds = ReferralHold::query()
            ->where('barangay_health_center_id', $request->user()->barangay_health_center_id)
            ->where('status', ReferralHold::STATUS_WAITING)
            ->with(['patient:id,first_name,last_name', 'ruralHealthUnit:id,name', 'healthRecord'])
            ->latest()
            ->get()
            ->map(fn (ReferralHold $hold) => $hold->toWaitingArray())
            ->values();

        return response()->json(['data' => $holds]);
    }

    public function show(Request $request, ReferralHold $referralHold)
    {
        $this->authorizeHold($request, $referralHold);

        $referralHold->load(['patient', 'ruralHealthUnit:id,name', 'healthRecord']);

        return response()->json(['data' => $referralHold->toWaitingArray()]);
    }

    public function discard(Request $request, ReferralHold $referralHold, ReferralHoldService $holds, AuditLogger $auditLogger)
    {
        $this->authorizeHold($request, $referralHold);
        abort_unless($referralHold->status === ReferralHold::STATUS_WAITING, 422, 'This hold is already resolved.');

        $data = $request->validate([
            'reason' => ['required', 'string', 'min:8', 'max:500'],
        ]);

        $holds->discard($referralHold, trim($data['reason']), $request->user());
        $auditLogger->log(
            $request,
            'discarded',
            'referral_holds',
            "Discarded unsent referral hold {$referralHold->id}: {$data['reason']}"
        );

        return response()->json(['data' => ['discarded' => true]]);
    }

    private function authorizeHold(Request $request, ReferralHold $referralHold): void
    {
        ActionPermissions::ensure($request->user(), 'referrals.submit');
        abort_unless(
            (int) $referralHold->barangay_health_center_id === (int) $request->user()->barangay_health_center_id,
            403
        );
    }
}
