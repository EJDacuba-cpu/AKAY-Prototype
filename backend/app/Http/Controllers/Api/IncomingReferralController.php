<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use App\Services\ReferralNoShowService;
use App\Support\StoredFunction;
use Illuminate\Http\Request;

class IncomingReferralController extends Controller
{
    public function index(Request $request, ReferralNoShowService $noShowService)
    {
        $noShowService->markOverduePending();

        if (StoredFunction::available()) {
            $perPage = $request->integer('per_page', 25);
            $page = max(1, $request->integer('page', 1));
            $rows = StoredFunction::select(
                'SELECT * FROM akay_incoming_referrals(?, ?, ?, ?)',
                [
                    $request->user()->rural_health_unit_id,
                    $request->query('status'),
                    $perPage,
                    ($page - 1) * $perPage,
                ]
            );

            return response()->json(['data' => StoredFunction::paginatedResponse($rows, $request)]);
        }

        $query = Referral::query()
            ->where('rural_health_unit_id', $request->user()->rural_health_unit_id)
            ->with(['patient', 'healthRecord', 'barangayHealthCenter', 'feedback']);

        if ($request->query('status')) {
            $query->where('status', $request->query('status'));
        }

        return response()->json(['data' => $query->latest()->paginate($request->integer('per_page', 25))]);
    }
}
