<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use App\Services\AuditLogger;
use App\Services\ReferralNoShowService;
use App\Support\StoredFunction;
use Illuminate\Http\Request;

class TrackingController extends Controller
{
    public function show(
        Request $request,
        string $value,
        AuditLogger $auditLogger,
        ReferralNoShowService $noShowService
    )
    {
        $referral = Referral::where('tracking_id', $value)
            ->orWhere('qr_code_value', $value)
            ->with(['patient', 'healthRecord', 'updates', 'feedback', 'barangayHealthCenter', 'ruralHealthUnit'])
            ->firstOrFail();

        $allowed = $request->user()->isAdmin()
            || ($request->user()->isBhw() && $referral->barangay_health_center_id === $request->user()->barangay_health_center_id)
            || ($request->user()->isRhuStaff() && $referral->rural_health_unit_id === $request->user()->rural_health_unit_id);

        abort_unless($allowed, 403, 'Referral is outside your assigned facility.');
        $noShowService->markOverduePending($referral);
        $referral->refresh();
        $auditLogger->log($request, 'lookup', 'tracking', "Looked up referral {$referral->tracking_id}.");

        if (StoredFunction::available()) {
            $data = StoredFunction::selectJson(
                'SELECT akay_referral_lookup(?, ?, ?, ?) AS data',
                [
                    $value,
                    $request->user()->role,
                    $request->user()->barangay_health_center_id,
                    $request->user()->rural_health_unit_id,
                ]
            );

            return response()->json(['data' => $data ?: $referral]);
        }

        return response()->json(['data' => $referral]);
    }
}
