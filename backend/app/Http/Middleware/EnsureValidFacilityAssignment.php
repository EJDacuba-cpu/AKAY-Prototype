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

        if (! $user->isAdmin()) {
            $workingFacility = app(\App\Services\WorkingFacilityService::class);
            // No valid duty location at all is a changed context, not a selection
            // mistake: revoke before select() can answer with a plain 403.
            if ($workingFacility->available($user) === []) {
                return $this->invalidContext($user);
            }
            $workingFacility->select($user, $request->header('X-Working-Facility'));
        }

        if (! $this->facilityAccess->hasValidFacilityAssignment($user)) {
            return $this->invalidContext($user);
        }

        return $next($request);
    }

    private function invalidContext(\App\Models\User $user): Response
    {
        $this->sessions->revokeAllTokens($user, 'invalid-facility-assignment');

        return response()->json([
            'message' => 'Your facility access has changed. Please sign in again.',
            'code' => 'SESSION_CONTEXT_INVALID',
        ], 403);
    }
}
