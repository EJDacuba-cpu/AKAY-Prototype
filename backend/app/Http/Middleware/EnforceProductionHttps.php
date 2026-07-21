<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceProductionHttps
{
    public function handle(Request $request, Closure $next): Response
    {
        if (config('app.env') === 'production'
            && config('security.https_redirect_enabled')
            && ! $request->isSecure()) {
            if ($request->is('api/*')) {
                return response()->json([
                    'message' => 'A secure HTTPS connection is required.',
                    'code' => 'HTTPS_REQUIRED',
                ], 426, [
                    'Cache-Control' => 'no-store, private',
                    'Pragma' => 'no-cache',
                    'Vary' => 'Authorization',
                ]);
            }

            return redirect()->secure($request->getRequestUri(), 308);
        }

        return $next($request);
    }
}
