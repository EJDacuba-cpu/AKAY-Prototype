<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** Walk-in check-in is blocked while the patient has a Pending BHC referral to this RHU. */
class RhuVisitPendingReferralException extends RuntimeException
{
    public function __construct(
        string $message = 'This patient has a pending BHC referral. Verify arrival via Incoming Referrals.'
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => 'VISIT_PENDING_REFERRAL',
        ], 409);
    }
}
