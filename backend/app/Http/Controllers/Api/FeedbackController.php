<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\FeedbackRequest;
use App\Models\Feedback;
use App\Models\Referral;
use App\Models\ReferralUpdate;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\UserNotificationService;
use Illuminate\Http\Request;

class FeedbackController extends Controller
{
    public function index(Request $request)
    {
        $query = Feedback::query()->with('referral.patient');
        $user = $request->user();

        if ($user->isBhw()) {
            $query->whereHas('referral', fn ($q) => $q->where('barangay_health_center_id', $user->barangay_health_center_id));
        } elseif ($user->isRhuStaff()) {
            $query->whereHas('referral', fn ($q) => $q->where('rural_health_unit_id', $user->rural_health_unit_id));
        }

        return response()->json(['data' => $query->latest()->paginate($request->integer('per_page', 25))]);
    }

    public function store(FeedbackRequest $request, AuditLogger $auditLogger, UserNotificationService $notifications)
    {
        $data = $request->validated();
        $referral = Referral::findOrFail($data['referral_id']);
        $this->authorizeReferral($request, $referral);

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
        $this->authorizeReferral($request, $feedback->referral);

        return response()->json(['data' => $feedback->load('referral.patient')]);
    }

    private function authorizeReferral(Request $request, Referral $referral): void
    {
        $allowed = $request->user()->isAdmin()
            || ($request->user()->isBhw() && $referral->barangay_health_center_id === $request->user()->barangay_health_center_id)
            || ($request->user()->isRhuStaff() && $referral->rural_health_unit_id === $request->user()->rural_health_unit_id);

        abort_unless($allowed, 403, 'Referral is outside your assigned facility.');
    }

    private function bhcUsers(Referral $referral)
    {
        return User::where('role', User::ROLE_BHW)
            ->where('barangay_health_center_id', $referral->barangay_health_center_id)
            ->where('status', User::STATUS_ACTIVE)
            ->get();
    }
}
