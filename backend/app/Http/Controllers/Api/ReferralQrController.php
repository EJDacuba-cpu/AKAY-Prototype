<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\ReferralQrService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReferralQrController extends Controller
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly ReferralQrService $qrTokens
    ) {
    }

    public function show(Request $request, Referral $referral, AuditLogger $auditLogger)
    {
        $result = DB::transaction(function () use ($request, $referral, $auditLogger): array {
            $lockedReferral = Referral::query()
                ->whereKey($referral->id)
                ->lockForUpdate()
                ->firstOrFail();
            $this->authorizeQrManagement($request, $lockedReferral);
            $result = $this->qrTokens->tokenForDisplay($lockedReferral);

            if ($result['created']) {
                $auditLogger->log(
                    $request,
                    'qr_generated',
                    'referrals',
                    'Generated a secure referral QR code.'
                );
            }

            return $result;
        });

        return $this->tokenResponse($referral, $result['token']);
    }

    public function regenerate(Request $request, Referral $referral, AuditLogger $auditLogger)
    {
        $token = DB::transaction(function () use ($request, $referral, $auditLogger): string {
            $lockedReferral = Referral::query()
                ->whereKey($referral->id)
                ->lockForUpdate()
                ->firstOrFail();
            $this->authorizeQrManagement($request, $lockedReferral);
            $token = $this->qrTokens->issue($lockedReferral);
            $auditLogger->log(
                $request,
                'qr_regenerated',
                'referrals',
                'Regenerated a secure referral QR code.'
            );

            return $token;
        });

        return $this->tokenResponse($referral, $token);
    }

    public function resolve(Request $request, AuditLogger $auditLogger)
    {
        $token = $request->input('token');
        if (! $this->qrTokens->isValidTokenFormat($token)) {
            return response()->json([
                'message' => 'The scanned code is not a valid AKAY referral QR code.',
                'code' => 'INVALID_QR_FORMAT',
            ], 422);
        }

        $referral = Referral::query()
            ->where('qr_token_hash', $this->qrTokens->hash($token))
            ->first();

        if (! $referral) {
            return $this->lookupFailed();
        }

        $resolved = DB::transaction(function () use ($request, $referral, $token, $auditLogger): ?Referral {
            $lockedReferral = Referral::query()
                ->whereKey($referral->id)
                ->lockForUpdate()
                ->first();

            if (
                ! $lockedReferral
                || ! hash_equals(
                    (string) $lockedReferral->qr_token_hash,
                    $this->qrTokens->hash($token)
                )
                || ! $request->user()->isRhuStaff()
                || ! $this->facilityAccess->canAccessReferral($request->user(), $lockedReferral)
            ) {
                return null;
            }

            $lockedReferral->update(['qr_token_last_used_at' => now()]);
            $auditLogger->log(
                $request,
                'qr_resolved',
                'referrals',
                'Resolved a secure referral QR code.'
            );

            return $lockedReferral;
        });

        if (! $resolved) {
            return $this->lookupFailed();
        }

        return response()->json(['data' => $this->resolutionData($resolved)]);
    }

    private function authorizeQrManagement(Request $request, Referral $referral): void
    {
        $user = $request->user();
        abort_unless(
            ($user->isBhw() || $user->isRhuStaff())
                && $this->facilityAccess->canAccessReferral($user, $referral),
            403,
            'This resource is outside your assigned facility.'
        );
    }

    private function tokenResponse(Referral $referral, string $token)
    {
        return response()->json([
            'data' => [
                'referral_id' => $referral->id,
                'qr_value' => $this->qrTokens->payload($token),
            ],
        ])->withHeaders([
            'Cache-Control' => 'no-store, private',
            'Pragma' => 'no-cache',
        ]);
    }

    private function lookupFailed()
    {
        return response()->json([
            'message' => 'This QR code is invalid, unavailable, or not accessible to your account.',
            'code' => 'QR_LOOKUP_FAILED',
        ], 404);
    }

    private function resolutionData(Referral $referral): array
    {
        return [
            'referral_id' => $referral->id,
            'tracking_id' => $referral->tracking_id,
            'status' => $referral->status,
            'display_url' => "/rhu/referrals/{$referral->tracking_id}",
        ];
    }
}
