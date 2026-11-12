<?php

namespace App\Http\Middleware;

use App\Services\UserSessionRevocationService;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccessTokenAbility
{
    public function __construct(
        private readonly UserSessionRevocationService $sessions
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $token = $user?->currentAccessToken();

        if ($token instanceof PersonalAccessToken && ! $token->can('akay:access')) {
            return response()->json([
                'message' => 'Your session is no longer valid. Please sign in again.',
                'code' => 'SESSION_INVALID',
            ], 401);
        }

        if ($token instanceof PersonalAccessToken
            && $user
            && ! $this->sessions->tokenMatchesActiveSession($token, $user)) {
            $token->delete();

            return response()->json([
                'message' => UserSessionRevocationService::SESSION_REPLACED_MESSAGE,
                'code' => 'SESSION_REPLACED',
            ], 401, [
                'Cache-Control' => 'no-store, private',
                'Pragma' => 'no-cache',
                'Vary' => 'Authorization, Cookie',
            ]);
        }

        return $next($request);
    }
}
