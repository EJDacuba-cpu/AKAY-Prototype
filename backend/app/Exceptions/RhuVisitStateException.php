<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** The visit is not in the state this action allows. */
class RhuVisitStateException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly ?int $visitId = null
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        $payload = [
            'message' => $this->getMessage(),
            'code' => $this->errorCode,
        ];
        if ($this->visitId !== null) {
            $payload['visit_id'] = $this->visitId;
        }

        return response()->json($payload, 409);
    }
}
