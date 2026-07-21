<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccessTokenAbility
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->user()?->currentAccessToken();

        if ($token instanceof PersonalAccessToken && ! $token->can('akay:access')) {
            return response()->json([
                'message' => 'Your session is no longer valid. Please sign in again.',
                'code' => 'SESSION_INVALID',
            ], 401);
        }

        return $next($request);
    }
}
