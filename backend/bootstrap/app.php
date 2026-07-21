<?php

use App\Services\UserSessionRevocationService;
use Illuminate\Foundation\Application;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Laravel\Sanctum\PersonalAccessToken;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(\App\Http\Middleware\ApplySecurityHeaders::class);
        $middleware->append(\App\Http\Middleware\EnforceProductionHttps::class);
        $middleware->replace(
            \Illuminate\Http\Middleware\TrustProxies::class,
            \App\Http\Middleware\TrustAkayProxies::class
        );
        $middleware->throttleApi();

        $middleware->trustHosts(
            at: fn (): array => config('security.trusted_hosts', []),
            subdomains: false
        );

        $middleware->alias([
            'active' => \App\Http\Middleware\EnsureUserIsActive::class,
            'facility.assigned' => \App\Http\Middleware\EnsureValidFacilityAssignment::class,
            'role' => \App\Http\Middleware\EnsureRole::class,
            'sensitive.no-store' => \App\Http\Middleware\PreventSensitiveResponseCaching::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->report(function (\Throwable $exception) {
            if (config('app.env') !== 'production'
                || ! app()->bound('request')
                || ! request()->is('api/*')) {
                return null;
            }

            Log::error('Unexpected AKAY API exception.', [
                'exception_type' => get_debug_type($exception),
                'request_method' => request()->method(),
                'route_uri' => request()->route()?->uri(),
            ]);

            return false;
        });

        $exceptions->render(function (\Throwable $exception, Request $request) {
            if (! $request->is('api/*')
                || config('app.env') !== 'production') {
                return null;
            }

            $status = match (true) {
                $exception instanceof HttpExceptionInterface => $exception->getStatusCode(),
                $exception instanceof HttpResponseException => $exception->getResponse()->getStatusCode(),
                $exception instanceof ValidationException => $exception->status,
                $exception instanceof AuthenticationException => 401,
                $exception instanceof AuthorizationException => $exception->status() ?? 403,
                $exception instanceof ModelNotFoundException => 404,
                default => 500,
            };

            if ($status < 500) {
                return null;
            }

            return response()->json([
                'message' => 'An unexpected error occurred. Please try again.',
                'code' => 'INTERNAL_SERVER_ERROR',
            ], 500);
        });

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
