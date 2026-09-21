<?php

namespace App\Exceptions;

use App\Models\HealthRecordDraft;
use RuntimeException;

/**
 * This consultation already has an active server draft.
 *
 * Raised when a client asks to create a draft for a consultation_uuid that is
 * already on the server - typically a consultation that went offline before its
 * first autosave and is now reconnecting, where another tab or device got there
 * first. Creating a second row would split one consultation in two, and writing
 * this request's payload over the existing one would silently discard content
 * this request has never seen.
 *
 * So neither happens: the caller is handed the draft's identity and version and
 * resolves it through the same reload-or-keep path as a version conflict. The
 * client keeps its on-device copy until the server confirms a write.
 */
class DraftConsultationExistsException extends RuntimeException
{
    public function __construct(private readonly ?HealthRecordDraft $draft = null)
    {
        parent::__construct('This consultation already has a saved draft.');
    }

    public function render()
    {
        return response()->json([
            'message' => 'This consultation already has a saved draft. Reload the latest version before saving.',
            'code' => 'DRAFT_CONSULTATION_EXISTS',
            'draft_id' => $this->draft?->public_id,
            'version' => $this->draft === null ? null : (int) $this->draft->version,
        ], 409);
    }
}
