<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(120)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(5)
            ->by(Str::lower(trim((string) $request->input('email'))).'|'.$request->ip())
            ->response(fn () => response()->json([
                'message' => 'Too many login attempts. Please wait briefly and try again.',
                'code' => 'LOGIN_THROTTLED',
            ], 429)));

        RateLimiter::for('referral-qr-resolve', fn (Request $request) => Limit::perMinute(60)
            ->by(($request->user()?->id ?: 'guest').'|'.$request->ip()));
        RateLimiter::for('referral-tracking-resolve', fn (Request $request) => Limit::perMinute(30)
            ->by(($request->user()?->id ?: 'guest').'|'.$request->ip()));
        RateLimiter::for('referral-qr-display', fn (Request $request) => Limit::perMinute(60)
            ->by(($request->user()?->id ?: 'guest').'|'.$request->ip()));
        RateLimiter::for('referral-qr-regenerate', fn (Request $request) => Limit::perMinute(10)
            ->by(($request->user()?->id ?: 'guest').'|'.$request->ip()));
    }
}
