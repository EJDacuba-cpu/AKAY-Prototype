<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use Illuminate\Http\Request;

class IncomingReferralController extends Controller
{
    public function index(Request $request)
    {
        $query = Referral::query()
            ->where('rural_health_unit_id', $request->user()->rural_health_unit_id)
            ->with(['patient', 'barangayHealthCenter', 'feedback']);

        if ($request->query('status')) {
            $query->where('status', $request->query('status'));
        }

        return response()->json(['data' => $query->latest()->paginate($request->integer('per_page', 25))]);
    }
}
