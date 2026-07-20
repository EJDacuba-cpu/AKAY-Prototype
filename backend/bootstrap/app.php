<?php

use App\Services\UserSessionRevocationService;
use Illuminate\Foundation\Application;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->throttleApi();

        $middleware->alias([
            'active' => \App\Http\Middleware\EnsureUserIsActive::class,
            'facility.assigned' => \App\Http\Middleware\EnsureValidFacilityAssignment::class,
            'role' => \App\Http\Middleware\EnsureRole::class,
            'sensitive.no-store' => \App\Http\Middleware\PreventSensitiveResponseCaching::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (AuthenticationException $exception, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            $token = $request->bearerToken()
                ? PersonalAccessToken::findToken($request->bearerToken())
                : null;
            $expired = $token
                && app(UserSessionRevocationService::class)->isExpired($token);

            if ($expired) {
                $token->delete();
            }

            return response()->json([
                'message' => $expired
                    ? 'Your session has expired. Please sign in again.'
                    : 'Your session is no longer valid. Please sign in again.',
                'code' => $expired ? 'SESSION_EXPIRED' : 'SESSION_INVALID',
            ], 401, [
                'Cache-Control' => 'no-store, private',
                'Pragma' => 'no-cache',
                'Vary' => 'Authorization',
            ]);
        });
    })->create();
