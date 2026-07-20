<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\UserSessionRevocationService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserIsActive
{
    public function __construct(
        private readonly UserSessionRevocationService $sessions
    ) {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user?->isActive()) {
            if ($user) {
                $this->sessions->revokeAllTokens($user, 'account-inactive');
            }

            return response()->json([
                'message' => 'Your session is no longer valid. Please sign in again.',
                'code' => 'ACCOUNT_INACTIVE',
            ], 403);
        }

        if (! in_array($user->role, [
            User::ROLE_ADMIN,
            User::ROLE_BHW,
            User::ROLE_RHU_STAFF,
        ], true)) {
            $this->sessions->revokeAllTokens($user, 'invalid-role');

            return response()->json([
                'message' => 'Your account access has changed. Please sign in again.',
                'code' => 'SESSION_CONTEXT_INVALID',
            ], 403);
        }

        return $next($request);
    }
}
