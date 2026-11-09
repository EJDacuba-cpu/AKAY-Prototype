<?php

namespace App\Http\Middleware;

use App\Services\FormDraftRecoveryKeyService;
use App\Services\HealthRecordDraftService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/** Must precede finalization's patient, visit, draft and generic-commit locks. */
class ClinicalRecoveryBoundary
{
    public function __construct(
        private readonly FormDraftRecoveryKeyService $keys,
        private readonly HealthRecordDraftService $drafts,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->isMethod('POST')) {
            return $next($request);
        }
        $uuid = $request->input('consultation_uuid');
        $draftId = $request->header('X-Health-Record-Draft-ID') ?: $request->input('draft_public_id');
        $run = fn () => $next($request);
        // The stored draft identity takes priority over untrusted body input.
        if (is_string($draftId) && $draftId !== '' && ! Str::isUuid($draftId)) {
            return $run(); // Preserve the FormRequest's inline validation contract.
        }
        if (is_string($draftId) && $draftId !== '') {
            return $this->drafts->withDraftIdentity($request->user(), $draftId, $run, is_string($uuid) && Str::isUuid($uuid) ? $uuid : null, true);
        }

        return is_string($uuid) && Str::isUuid($uuid)
            ? $this->keys->withClinicalIdentity($uuid, $run)
            : $run();
    }
}
