<?php

namespace App\Exceptions;

use RuntimeException;

class DraftFinalizationConflictException extends RuntimeException
{
    public function __construct(
        private readonly string $errorCode = 'DRAFT_FINALIZATION_CONFLICT',
        string $message = 'This draft is no longer available for finalization.'
    ) {
        parent::__construct($message);
    }

    public function render()
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => $this->errorCode,
        ], 409);
    }
}
