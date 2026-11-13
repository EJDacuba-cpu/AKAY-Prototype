<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use App\Services\FacilityAccessService;
use App\Services\ReferralLinkedRecordRedactor;
use Illuminate\Http\Request;

class IncomingReferralController extends Controller
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly ReferralLinkedRecordRedactor $linkedRecordRedactor
    ) {
    }

    public function index(Request $request)
    {
        $query = $this->facilityAccess
            ->scopeReferrals(Referral::query(), $request->user())
            ->with(['patient', 'healthRecord', 'barangayHealthCenter', 'feedback']);

        if ($request->query('status')) {
            $query->where('status', $request->query('status'));
        }

        $page = $query->latest()->paginate($request->integer('per_page', 25));
        $page->setCollection(
            $this->linkedRecordRedactor->redactMany($page->getCollection(), $request->user())
        );

        return response()->json(['data' => $page]);
    }
}
