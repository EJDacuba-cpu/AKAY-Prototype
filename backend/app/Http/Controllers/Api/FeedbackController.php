<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\FeedbackRequest;
use App\Models\Feedback;
use App\Models\Referral;
use App\Models\ReferralUpdate;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\UserNotificationService;
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

    public function store(FeedbackRequest $request, AuditLogger $auditLogger, UserNotificationService $notifications)
    {
        $data = $request->validated();
        $referral = Referral::findOrFail($data['referral_id']);
        $this->facilityAccess->authorizeRhuReferralAction($request->user(), $referral);

        $feedback = Feedback::updateOrCreate(
            ['referral_id' => $referral->id],
            [...$data, 'created_by' => $request->user()->id, 'received_at' => $data['received_at'] ?? now()]
        );

        $previous = $referral->status;
        $referral->update(['status' => Referral::STATUS_COMPLETED]);
        ReferralUpdate::create([
            'referral_id' => $referral->id,
            'user_id' => $request->user()->id,
            'previous_status' => $previous,
            'status' => Referral::STATUS_COMPLETED,
            'remarks' => 'Feedback submitted.',
        ]);

        $referral->loadMissing(['patient', 'ruralHealthUnit']);
        $patientName = $referral->patient?->full_name ?: 'The referred patient';
        $rhuName = $referral->ruralHealthUnit?->name ?: 'Rural Health Unit Bulakan';

        $notifications->notifyUsersOnce(
            $this->bhcUsers($referral),
            'RHU Return Slip Received',
            "{$rhuName} submitted feedback for {$patientName}.",
            'rhu_return_slip_received',
            $referral->id,
            "/bhc/referrals/{$referral->tracking_id}",
            'referral_feedback',
            $referral->id
        );

        $auditLogger->log($request, 'submitted', 'feedback', "Submitted feedback for referral {$referral->tracking_id}.");

        return response()->json(['data' => $feedback->load('referral.patient')], 201);
    }

    public function show(Request $request, Feedback $feedback)
    {
        $this->facilityAccess->authorizeReferral($request->user(), $feedback->referral);

        return response()->json(['data' => $feedback->load('referral.patient')]);
    }

    private function bhcUsers(Referral $referral)
    {
        return User::where('role', User::ROLE_BHW)
            ->where('barangay_health_center_id', $referral->barangay_health_center_id)
            ->where('status', User::STATUS_ACTIVE)
            ->get();
    }
}
