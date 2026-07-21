<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReferralRequest;
use App\Http\Requests\ReferralStatusRequest;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\Referral;
use App\Services\FacilityAccessService;
use App\Services\ReferralCreationService;
use App\Services\ReferralRoutingService;
use App\Services\ReferralWorkflowService;
use App\Support\StoredFunction;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

    public function index(Request $request)
    {
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

            $response = StoredFunction::paginatedResponse($rows, $request);
            $response['data'] = array_map(
                fn (?array $item): ?array => $this->stripQrSecrets($item),
                $response['data']
            );

            return response()->json(['data' => $response]);
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
        ReferralCreationService $referralCreation
    ) {
        $user = $request->user();
        $data = $request->validated();

        $patient = Patient::findOrFail($data['patient_id']);
        $this->facilityAccess->authorizePatientModification($user, $patient);
        $record = ! empty($data['health_record_id'])
            ? HealthRecord::findOrFail($data['health_record_id'])
            : null;

        if (! empty($data['client_submission_id'])) {
            $existingReferral = $this->scope(Referral::query(), $request)
                ->where('client_submission_id', $data['client_submission_id'])
                ->first();

            if ($existingReferral) {
                return $this->storeResponse($existingReferral, 200);
            }
        }

        try {
            $referral = DB::transaction(
                fn (): Referral => $referralCreation->create($request, $patient, $data, $record)
            );
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

        return $this->storeResponse($referral, 201);
    }

    public function show(Request $request, Referral $referral)
    {
        $this->facilityAccess->authorizeReferral($request->user(), $referral);

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

            return response()->json(['data' => $this->stripQrSecrets($data)]);
        }

        return response()->json(['data' => $referral->load(['patient', 'healthRecord', 'updates.user', 'feedback', 'barangayHealthCenter', 'ruralHealthUnit'])]);
    }

    public function updateStatus(
        ReferralStatusRequest $request,
        Referral $referral,
        ReferralWorkflowService $workflow
    ) {
        $data = $request->validated();

        $result = $workflow->transition(
            $request,
            $referral->getKey(),
            $data['status'],
            $data['remarks'] ?? null
        );

        return response()->json([
            'data' => $result['referral'],
            'status_unchanged' => $result['status_unchanged'],
            'status' => $result['status'],
        ]);
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

    private function stripQrSecrets(?array $data): ?array
    {
        if ($data === null) {
            return null;
        }

        unset(
            $data['qr_code_value'],
            $data['qr_token_hash'],
            $data['qr_token_encrypted'],
            $data['qr_token_issued_at'],
            $data['qr_token_last_used_at']
        );

        return $data;
    }

}
