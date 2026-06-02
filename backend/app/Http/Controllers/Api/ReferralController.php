<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReferralRequest;
use App\Http\Requests\ReferralStatusRequest;
use App\Models\Referral;
use App\Models\ReferralUpdate;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\ReferralService;
use App\Services\UserNotificationService;
use Illuminate\Http\Request;

class ReferralController extends Controller
{
    public function index(Request $request)
    {
        $query = $this->scope(Referral::query(), $request)->with(['patient', 'barangayHealthCenter', 'ruralHealthUnit', 'feedback']);

        foreach (['status', 'referral_category', 'urgency_level', 'barangay_health_center_id'] as $filter) {
            if ($request->query($filter)) {
                $query->where($filter, $request->query($filter));
            }
        }

        if ($search = $request->query('search')) {
            $query->where(fn ($q) => $q
                ->where('tracking_id', 'like', "%{$search}%")
                ->orWhereHas('patient', fn ($p) => $p
                    ->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")));
        }

        return response()->json(['data' => $query->latest()->paginate($request->integer('per_page', 25))]);
    }

    public function store(
        ReferralRequest $request,
        ReferralService $referralService,
        AuditLogger $auditLogger,
        UserNotificationService $notifications
    ) {
        $user = $request->user();
        $data = $request->validated();
        $trackingId = $referralService->makeTrackingId();

        if ($user->isBhw()) {
            $data['barangay_health_center_id'] = $user->barangay_health_center_id;
        }

        abort_unless($data['barangay_health_center_id'] ?? null, 422, 'Barangay health center is required.');

        $referral = Referral::create([
            ...$data,
            'tracking_id' => $trackingId,
            'qr_code_value' => $referralService->makeQrValue($trackingId),
            'created_by' => $user->id,
            'status' => Referral::STATUS_PENDING,
            'urgency_level' => $data['urgency_level'] ?? 'Normal',
            'referral_datetime' => $data['referral_datetime'] ?? now(),
        ]);

        ReferralUpdate::create([
            'referral_id' => $referral->id,
            'user_id' => $user->id,
            'status' => Referral::STATUS_PENDING,
            'remarks' => 'Referral submitted.',
        ]);

        $rhuUsers = User::where('role', User::ROLE_RHU_STAFF)
            ->where('rural_health_unit_id', $referral->rural_health_unit_id)
            ->where('status', User::STATUS_ACTIVE)
            ->get();

        $notifications->notifyUsers($rhuUsers, 'New referral submitted', "Referral {$referral->tracking_id} was submitted.", 'referral_submitted', $referral->id);
        $auditLogger->log($request, 'submitted', 'referrals', "Submitted referral {$referral->tracking_id}.");

        return response()->json(['data' => $referral->load(['patient', 'barangayHealthCenter', 'ruralHealthUnit'])], 201);
    }

    public function show(Request $request, Referral $referral)
    {
        $this->authorizeReferral($request, $referral);

        return response()->json(['data' => $referral->load(['patient', 'updates.user', 'feedback', 'barangayHealthCenter', 'ruralHealthUnit'])]);
    }

    public function updateStatus(
        ReferralStatusRequest $request,
        Referral $referral,
        AuditLogger $auditLogger,
        UserNotificationService $notifications
    ) {
        $this->authorizeReferral($request, $referral);
        $data = $request->validated();
        $previous = $referral->status;

        $referral->update([
            'status' => $data['status'],
            'remarks' => $data['remarks'] ?? $referral->remarks,
        ]);

        ReferralUpdate::create([
            'referral_id' => $referral->id,
            'user_id' => $request->user()->id,
            'previous_status' => $previous,
            'status' => $data['status'],
            'remarks' => $data['remarks'] ?? null,
        ]);

        $notifications->notifyUser($referral->creator, 'Referral status updated', "Referral {$referral->tracking_id} is now {$data['status']}.", 'referral_status', $referral->id);
        $auditLogger->log($request, 'status_updated', 'referrals', "Updated referral {$referral->tracking_id} to {$data['status']}.");

        return response()->json(['data' => $referral->fresh()->load(['patient', 'updates'])]);
    }

    public function destroy(Request $request, Referral $referral)
    {
        $this->authorizeReferral($request, $referral);
        $referral->delete();

        return response()->json(status: 204);
    }

    protected function scope($query, Request $request)
    {
        $user = $request->user();

        if ($user->isBhw()) {
            $query->where('barangay_health_center_id', $user->barangay_health_center_id);
        } elseif ($user->isRhuStaff()) {
            $query->where('rural_health_unit_id', $user->rural_health_unit_id);
        }

        return $query;
    }

    protected function authorizeReferral(Request $request, Referral $referral): void
    {
        $allowed = $request->user()->isAdmin()
            || ($request->user()->isBhw() && $referral->barangay_health_center_id === $request->user()->barangay_health_center_id)
            || ($request->user()->isRhuStaff() && $referral->rural_health_unit_id === $request->user()->rural_health_unit_id);

        abort_unless($allowed, 403, 'Referral is outside your assigned facility.');
    }
}
