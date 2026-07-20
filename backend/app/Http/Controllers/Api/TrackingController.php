<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use Illuminate\Http\Request;

class TrackingController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    public function resolve(Request $request, AuditLogger $auditLogger)
    {
        $trackingId = strtoupper(trim((string) $request->input('tracking_id', '')));
        $user = $request->user();

        if (
            preg_match('/^AKY-\d{8}-[A-Z0-9]{6}$/D', $trackingId) !== 1
            || (! $user->isBhw() && ! $user->isRhuStaff())
        ) {
            return $this->lookupFailed();
        }

        $referral = Referral::where('tracking_id', $trackingId)->first();
        if (! $referral || ! $this->facilityAccess->canAccessReferral($user, $referral)) {
            return $this->lookupFailed();
        }

        $auditLogger->log(
            $request,
            'tracking_resolved',
            'referrals',
            'Resolved an authorized referral tracking ID.'
        );

        $rolePath = $user->isBhw() ? 'bhc' : 'rhu';

        return response()->json(['data' => [
            'referral_id' => $referral->id,
            'tracking_id' => $referral->tracking_id,
            'status' => $referral->status,
            'display_url' => "/{$rolePath}/referrals/{$referral->tracking_id}",
        ]]);
    }

    private function lookupFailed()
    {
        return response()->json([
            'message' => 'This tracking ID is invalid, unavailable, or not accessible to your account.',
            'code' => 'TRACKING_LOOKUP_FAILED',
        ], 404);
    }
}
