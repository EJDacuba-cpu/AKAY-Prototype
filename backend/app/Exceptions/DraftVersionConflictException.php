<?php

namespace App\Exceptions;

use RuntimeException;

class DraftVersionConflictException extends RuntimeException
{
    public function render()
    {
        return response()->json([
            'message' => 'This draft was updated elsewhere. Reload the latest version before saving.',
            'code' => 'DRAFT_VERSION_CONFLICT',
        ], 409);
    }
}
