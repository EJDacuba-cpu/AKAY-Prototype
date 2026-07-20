<?php

namespace App\Http\Middleware;

use App\Services\FacilityAccessService;
use App\Services\UserSessionRevocationService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureValidFacilityAssignment
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly UserSessionRevocationService $sessions
    ) {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        abort_unless($user, 401);

        if (! $this->facilityAccess->hasValidFacilityAssignment($user)) {
            $this->sessions->revokeAllTokens($user, 'invalid-facility-assignment');

            return response()->json([
                'message' => 'Your facility access has changed. Please sign in again.',
                'code' => 'SESSION_CONTEXT_INVALID',
            ], 403);
        }

        return $next($request);
    }
}
