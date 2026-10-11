<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * An account holding a temporary password may only read its profile, sign out, or change the password.
 * Every other authenticated route is refused until the password has been changed.
 */
class EnsurePasswordIsCurrent
{
    private const ALLOWED_PATHS = [
        'api/auth/profile',
        'api/auth/logout',
        'api/auth/change-password',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->must_change_password && ! $request->is(self::ALLOWED_PATHS)) {
            return response()->json([
                'message' => 'You must change your temporary password before continuing.',
                'code' => 'PASSWORD_CHANGE_REQUIRED',
            ], 403);
        }

        return $next($request);
    }
}
