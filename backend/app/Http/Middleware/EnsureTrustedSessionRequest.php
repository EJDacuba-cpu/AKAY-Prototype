<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTrustedSessionRequest
{
    public function handle(Request $request, Closure $next): Response
    {
        $origin = $request->headers->get('Origin');

        if ($origin !== null) {
            $allowedOrigins = array_map(
                fn (string $allowed): string => rtrim($allowed, '/'),
                config('cors.allowed_origins', [])
            );

            if (! in_array(rtrim($origin, '/'), $allowedOrigins, true)
                || ! hash_equals('1', (string) $request->header('X-AKAY-Session'))) {
                return response()->json([
                    'message' => 'The session request could not be verified.',
                    'code' => 'SESSION_REQUEST_INVALID',
                ], 419);
            }
        }

        return $next($request);
    }
}
