<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class TrackingController extends Controller
{
    public function show(Request $request, string $value, AuditLogger $auditLogger)
    {
        $referral = Referral::where('tracking_id', $value)
            ->orWhere('qr_code_value', $value)
            ->with(['patient', 'updates', 'feedback', 'barangayHealthCenter', 'ruralHealthUnit'])
            ->firstOrFail();

        $allowed = $request->user()->isAdmin()
            || ($request->user()->isBhw() && $referral->barangay_health_center_id === $request->user()->barangay_health_center_id)
            || ($request->user()->isRhuStaff() && $referral->rural_health_unit_id === $request->user()->rural_health_unit_id);

        abort_unless($allowed, 403, 'Referral is outside your assigned facility.');
        $auditLogger->log($request, 'lookup', 'tracking', "Looked up referral {$referral->tracking_id}.");

        return response()->json(['data' => $referral]);
    }
}
