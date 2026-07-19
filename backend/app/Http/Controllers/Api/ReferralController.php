<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReferralRequest;
use App\Http\Requests\ReferralStatusRequest;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\ReferralUpdate;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\ReferralNoShowService;
use App\Services\ReferralRoutingService;
use App\Services\ReferralService;
use App\Services\UserNotificationService;
use App\Support\StoredFunction;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;

class ReferralController extends Controller
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly ReferralRoutingService $referralRouting
    ) {
    }

    public function destination(Request $request)
    {
        $route = $this->referralRouting->resolveForBhw($request->user());

        return response()->json([
            'data' => [
                'referring_barangay_health_center' => $route['bhc']->only(['id', 'name', 'status']),
                'receiving_rural_health_unit' => $route['rhu']->only(['id', 'name', 'status']),
            ],
        ]);
    }

    public function index(Request $request, ReferralNoShowService $noShowService)
    {
        $noShowService->markOverduePending();

        if (StoredFunction::available() && $request->user()->isAdmin()) {
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

        abort_unless($user->isBhw(), 403, 'Only BHW accounts can create referrals.');
        $route = $this->referralRouting->resolveForBhw($user);
        $patient = Patient::findOrFail($data['patient_id']);
        $this->facilityAccess->authorizePatientModification($user, $patient);
        $data['barangay_health_center_id'] = $route['bhc']->id;
        $data['rural_health_unit_id'] = $route['rhu']->id;

        if (! empty($data['health_record_id'])) {
            $record = HealthRecord::findOrFail($data['health_record_id']);
            $this->facilityAccess->authorizeHealthRecord($user, $record);

            abort_unless(
                (int) $record->patient_id === (int) $patient->id
                    && (int) $record->barangay_health_center_id === (int) $user->barangay_health_center_id,
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

        $referral->loadMissing(['patient', 'barangayHealthCenter', 'ruralHealthUnit']);
        $patientName = $this->patientName($referral);
        $bhcName = $this->bhcName($referral);

        $notifications->notifyUsersOnce(
            $this->rhuUsers($referral),
            'New Incoming Referral',
            "{$bhcName} sent a referral for {$patientName}.",
            'incoming_referral',
            $referral->id,
            $this->rhuReferralLink($referral),
            'referral',
            $referral->id
        );

        $notifications->notifyUsersOnce(
            $this->bhcUsers($referral),
            'Referral Submitted',
            'The referral was successfully sent to RHU.',
            'referral_submitted',
            $referral->id,
            $this->bhcReferralLink($referral),
            'referral',
            $referral->id
        );

        // TODO: Add admin-level referral activity notifications once an admin referral destination page is defined.
        $auditLogger->log($request, 'submitted', 'referrals', "Submitted referral {$referral->tracking_id}.");

        return $this->storeResponse($referral, 201);
    }

    public function show(Request $request, Referral $referral, ReferralNoShowService $noShowService)
    {
        $this->facilityAccess->authorizeReferral($request->user(), $referral);
        $noShowService->markOverduePending($referral);
        $referral->refresh();

        if (StoredFunction::available() && $request->user()->isAdmin()) {
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
        $this->facilityAccess->authorizeRhuReferralAction($request->user(), $referral);
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

        if ($previous !== Referral::STATUS_RECEIVED && $data['status'] === Referral::STATUS_RECEIVED) {
            $patientName = $this->patientName($referral);
            $rhuName = $this->rhuName($referral);

            if (
                $request->user()->isRhuStaff()
                && $referral->patient
                && (int) $referral->patient->rural_health_unit_id !== (int) $referral->rural_health_unit_id
            ) {
                $referral->patient->update([
                    'rural_health_unit_id' => $referral->rural_health_unit_id,
                ]);
            }

            $notifications->notifyUsersOnce(
                $this->bhcUsers($referral),
                'Referral Received by RHU',
                "{$rhuName} has received the referral for {$patientName}.",
                'referral_received_by_rhu',
                $referral->id,
                $this->bhcReferralLink($referral),
                'referral_received',
                $referral->id
            );

            if ($request->user()->isRhuStaff()) {
                $notifications->notifyUsersOnce(
                    $this->bhcUsers($referral),
                    'Patient Checked In at RHU',
                    "{$patientName} has arrived and was checked in at {$rhuName}.",
                    'patient_checked_in_rhu',
                    $referral->id,
                    $this->bhcReferralLink($referral),
                    'referral_check_in_bhc',
                    $referral->id
                );

                $notifications->notifyUsersOnce(
                    $this->rhuUsers($referral),
                    'Patient Checked In',
                    "{$patientName} is ready for referral processing.",
                    'patient_checked_in',
                    $referral->id,
                    $this->rhuReferralLink($referral),
                    'referral_check_in_rhu',
                    $referral->id
                );
            }
        }

        $auditLogger->log($request, 'status_updated', 'referrals', "Updated referral {$referral->tracking_id} to {$data['status']}.");

        return response()->json(['data' => $referral->fresh()->load(['patient', 'healthRecord', 'updates'])]);
    }

    public function destroy(Request $request, Referral $referral)
    {
        $this->facilityAccess->authorizeReferral($request->user(), $referral);
        $referral->delete();

        return response()->json(status: 204);
    }

    protected function scope($query, Request $request)
    {
        return $this->facilityAccess->scopeReferrals($query, $request->user());
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

    private function bhcUsers(Referral $referral)
    {
        return User::where('role', User::ROLE_BHW)
            ->where('barangay_health_center_id', $referral->barangay_health_center_id)
            ->where('status', User::STATUS_ACTIVE)
            ->get();
    }

    private function rhuUsers(Referral $referral)
    {
        return User::where('role', User::ROLE_RHU_STAFF)
            ->where('rural_health_unit_id', $referral->rural_health_unit_id)
            ->where('status', User::STATUS_ACTIVE)
            ->get();
    }

    private function patientName(Referral $referral): string
    {
        return $referral->patient?->full_name ?: 'The referred patient';
    }

    private function bhcName(Referral $referral): string
    {
        return $referral->barangayHealthCenter?->name ?: 'BHC';
    }

    private function rhuName(Referral $referral): string
    {
        return $referral->ruralHealthUnit?->name ?: 'Rural Health Unit Bulakan';
    }

    private function bhcReferralLink(Referral $referral): string
    {
        return "/bhc/referrals/{$referral->tracking_id}";
    }

    private function rhuReferralLink(Referral $referral): string
    {
        return "/rhu/referrals/{$referral->tracking_id}";
    }
}
