<?php

namespace App\Exceptions;

use App\Models\RhuVisitQueueEntry;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/** The patient already has an active visit at this RHU. */
class RhuVisitDuplicateActiveException extends RuntimeException
{
    public function __construct(
        public readonly RhuVisitQueueEntry $entry,
        string $message = 'This patient is already in today\'s queue.'
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => 'VISIT_ALREADY_ACTIVE',
            'active_visit_id' => $this->entry->id,
        ], 409);
    }
}
