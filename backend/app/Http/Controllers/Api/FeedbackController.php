<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\FeedbackRequest;
use App\Models\Feedback;
use App\Services\FacilityAccessService;
use App\Services\ReferralWorkflowService;
use Illuminate\Http\Request;

class FeedbackController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    public function index(Request $request)
    {
        $query = Feedback::query()->with('referral.patient');
        $user = $request->user();

        $query->whereHas(
            'referral',
            function ($referrals) use ($user): void {
                $this->facilityAccess->scopeReferrals($referrals, $user);

                if ($user->isBhw()) {
                    $referrals->whereHas('patient', fn ($patients) => $patients
                        ->where('barangay_health_center_id', $user->barangay_health_center_id));
                }
            }
        );

        return response()->json(['data' => $query->latest()->paginate($request->integer('per_page', 25))]);
    }

    public function store(FeedbackRequest $request, ReferralWorkflowService $workflow)
    {
        $data = $request->validated();
        $feedback = $workflow->completeWithFeedback(
            $request,
            (int) $data['referral_id'],
            $data
        );

        return response()->json(['data' => $feedback->load('referral.patient')], 201);
    }

    public function show(Request $request, Feedback $feedback)
    {
        $this->facilityAccess->authorizeReferral($request->user(), $feedback->referral);

        return response()->json(['data' => $feedback->load('referral.patient')]);
    }
}
