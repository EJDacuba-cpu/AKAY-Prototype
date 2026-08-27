<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ReferralHold;
use App\Services\ReferralHoldService;
use Illuminate\Http\Request;

class ReferralHoldController extends Controller
{
    public function index(Request $request)
    {
        $holds = ReferralHold::query()
            ->where('created_by', $request->user()->id)
            ->where('status', ReferralHold::STATUS_WAITING)
            ->with(['patient:id,first_name,last_name', 'ruralHealthUnit:id,name'])
            ->latest()
            ->get();

        return response()->json(['data' => $holds]);
    }

    public function discard(Request $request, ReferralHold $referralHold, ReferralHoldService $holds)
    {
        abort_unless($referralHold->created_by === $request->user()->id, 403);
        abort_unless($referralHold->status === ReferralHold::STATUS_WAITING, 422, 'This hold is already resolved.');

        $holds->discard($referralHold);

        return response()->json(['data' => ['discarded' => true]]);
    }
}
