<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class ReferralWorkflowConflictException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly string $workflowCode,
        public readonly ?string $currentStatus = null,
        public readonly ?string $requestedStatus = null
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(array_filter([
            'message' => $this->getMessage(),
            'code' => $this->workflowCode,
            'current_status' => $this->currentStatus,
            'requested_status' => $this->requestedStatus,
        ], fn (mixed $value): bool => $value !== null), 409);
    }
}
