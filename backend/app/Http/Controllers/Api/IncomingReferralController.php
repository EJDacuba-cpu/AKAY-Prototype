<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use App\Services\FacilityAccessService;
use App\Services\ReferralNoShowService;
use Illuminate\Http\Request;

class IncomingReferralController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    public function index(Request $request, ReferralNoShowService $noShowService)
    {
        $noShowService->markOverduePending();

        $query = $this->facilityAccess
            ->scopeReferrals(Referral::query(), $request->user())
            ->with(['patient', 'healthRecord', 'barangayHealthCenter', 'feedback']);

        if ($request->query('status')) {
            $query->where('status', $request->query('status'));
        }

        return response()->json(['data' => $query->latest()->paginate($request->integer('per_page', 25))]);
    }
}
