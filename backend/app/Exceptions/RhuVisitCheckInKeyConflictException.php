<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** The check-in key was already used at this RHU for a different patient, referral or source. */
class RhuVisitCheckInKeyConflictException extends RuntimeException
{
    public function __construct(string $message = 'This check-in was already submitted with different details.')
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => 'VISIT_CHECK_IN_KEY_CONFLICT',
        ], 409);
    }
}
