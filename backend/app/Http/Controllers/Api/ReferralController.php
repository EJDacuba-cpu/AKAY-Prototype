<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReferralRequest;
use App\Http\Requests\ReferralStatusRequest;
use App\Models\HealthRecord;
use App\Models\Referral;
use App\Models\ReferralUpdate;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\ReferralService;
use App\Services\UserNotificationService;
use App\Support\StoredFunction;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;

class ReferralController extends Controller
{
    public function index(Request $request)
    {
        if (StoredFunction::available()) {
            $perPage = $request->integer('per_page', 25);
            $page = max(1, $request->integer('page', 1));
            $rows = StoredFunction::select(
                'SELECT * FROM akay_referral_list(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $request->user()->role,
                    $request->user()->barangay_health_center_id,
                    $request->user()->rural_health_unit_id,
                    $request->query('status'),
                    $request->query('referral_category'),
                    $request->query('urgency_level'),
                    $request->query('barangay_health_center_id')
                        ? (int) $request->query('barangay_health_center_id')
                        : null,
                    $request->query('search'),
                    $perPage,
                    ($page - 1) * $perPage,
                ]
            );

            return response()->json(['data' => StoredFunction::paginatedResponse($rows, $request)]);
        }

        $query = $this->scope(Referral::query(), $request)->with(['patient', 'healthRecord', 'barangayHealthCenter', 'ruralHealthUnit', 'feedback']);

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

        if ($user->isBhw()) {
            $data['barangay_health_center_id'] = $user->barangay_health_center_id;
        }

        abort_unless($data['barangay_health_center_id'] ?? null, 422, 'Barangay health center is required.');

        if (! empty($data['health_record_id'])) {
            $record = HealthRecord::findOrFail($data['health_record_id']);

            abort_unless(
                (int) $record->patient_id === (int) $data['patient_id'],
                422,
                'Health record must belong to the referred patient.'
            );
        }

        if (! empty($data['client_submission_id'])) {
            $existingReferral = $this->scope(Referral::query(), $request)
                ->where('client_submission_id', $data['client_submission_id'])
                ->first();

            if ($existingReferral) {
                return $this->storeResponse($existingReferral, 200);
            }
        }

        try {
            $trackingId = $referralService->makeTrackingId();
            $referral = Referral::create([
                ...$data,
                'tracking_id' => $trackingId,
                'qr_code_value' => $referralService->makeQrValue($trackingId),
                'created_by' => $user->id,
                'status' => Referral::STATUS_PENDING,
                'urgency_level' => $data['urgency_level'] ?? 'Normal',
                'referral_datetime' => $data['referral_datetime'] ?? now(),
            ]);
        } catch (QueryException $exception) {
            if (! empty($data['client_submission_id']) && $this->isClientSubmissionConflict($exception)) {
                $existingReferral = $this->scope(Referral::query(), $request)
                    ->where('client_submission_id', $data['client_submission_id'])
                    ->first();

                if ($existingReferral) {
                    return $this->storeResponse($existingReferral, 200);
                }
            }

            throw $exception;
        }

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

        return $this->storeResponse($referral, 201);
    }

    public function show(Request $request, Referral $referral)
    {
        $this->authorizeReferral($request, $referral);

        if (StoredFunction::available()) {
            $data = StoredFunction::selectJson(
                'SELECT akay_referral_details(?, ?, ?, ?) AS data',
                [
                    $referral->id,
                    $request->user()->role,
                    $request->user()->barangay_health_center_id,
                    $request->user()->rural_health_unit_id,
                ]
            );

            abort_unless($data, 404);

            return response()->json(['data' => $data]);
        }

        return response()->json(['data' => $referral->load(['patient', 'healthRecord', 'updates.user', 'feedback', 'barangayHealthCenter', 'ruralHealthUnit'])]);
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

        $referral->loadMissing(['patient', 'ruralHealthUnit']);
        $patientName = $referral->patient?->full_name ?: 'The referred patient';
        $rhuName = $referral->ruralHealthUnit?->name ?: 'the RHU';
        $notificationTitle = 'Referral status updated';
        $notificationMessage = "Referral {$referral->tracking_id} is now {$data['status']}.";

        if ($request->user()->isRhuStaff() && $data['status'] === Referral::STATUS_RECEIVED) {
            $notificationTitle = 'Patient checked in at RHU';
            $notificationMessage = "{$patientName} has arrived and was checked in at {$rhuName}.";
        }

        $notifications->notifyUser($referral->creator, $notificationTitle, $notificationMessage, 'referral_status', $referral->id);
        $auditLogger->log($request, 'status_updated', 'referrals', "Updated referral {$referral->tracking_id} to {$data['status']}.");

        return response()->json(['data' => $referral->fresh()->load(['patient', 'healthRecord', 'updates'])]);
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

    protected function storeResponse(Referral $referral, int $status)
    {
        return response()->json([
            'data' => $referral->load(['patient', 'healthRecord', 'barangayHealthCenter', 'ruralHealthUnit']),
        ], $status);
    }

    protected function isClientSubmissionConflict(QueryException $exception): bool
    {
        $sqlState = $exception->errorInfo[0] ?? null;
        $message = strtolower($exception->getMessage());

        return in_array($sqlState, ['23505', '23000'], true)
            && str_contains($message, 'client_submission_id');
    }

    protected function authorizeReferral(Request $request, Referral $referral): void
    {
        $allowed = $request->user()->isAdmin()
            || ($request->user()->isBhw() && $referral->barangay_health_center_id === $request->user()->barangay_health_center_id)
            || ($request->user()->isRhuStaff() && $referral->rural_health_unit_id === $request->user()->rural_health_unit_id);

        abort_unless($allowed, 403, 'Referral is outside your assigned facility.');
    }
}
