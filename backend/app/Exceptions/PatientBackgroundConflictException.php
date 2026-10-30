<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A consultation tried to save a background section that changed after the
 * clinician began editing it. Thrown inside the record's transaction, so the
 * record is never created; the workspace shows latest vs. mine and retries.
 */
class PatientBackgroundConflictException extends RuntimeException
{
    /** @param  array<int, array{section: string, current: array, revision: int, updatedAt: ?string}>  $conflicts */
    public function __construct(public readonly array $conflicts)
    {
        parent::__construct('Patient background changed since it was opened.');
    }

    public function render()
    {
        return response()->json([
            'message' => 'Part of the patient background was updated by another save. Review the latest version before saving.',
            'code' => 'PATIENT_BACKGROUND_CONFLICT',
            'conflicts' => $this->conflicts,
        ], 409);
    }
}
