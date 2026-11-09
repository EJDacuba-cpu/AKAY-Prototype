<?php

namespace App\Providers;

use App\Mail\GmailApiTransport;
use Google\Client as GoogleClient;
use Google\Service\Gmail as GmailService;
use Illuminate\Support\Facades\Mail;
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
        $this->app->scoped(\App\Services\FormDraftRecoveryKeyService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
    Mail::extend('gmail_api', function (array $config = []) {
        $clientId = config('services.google_gmail.client_id');
        $clientSecret = config('services.google_gmail.client_secret');
        $refreshToken = config('services.google_gmail.refresh_token');

        if (! $clientId || ! $clientSecret || ! $refreshToken) {
            throw new \RuntimeException(
                'Gmail API credentials are not configured.'
            );
        }

        $client = $this->app->make(GoogleClient::class);
        $client->setClientId($clientId);
        $client->setClientSecret($clientSecret);

        $result = $client->fetchAccessTokenWithRefreshToken(
            $refreshToken
        );

        if (! isset($result['access_token'])) {
            throw new \RuntimeException(
                'Gmail API authorization failed.'
            );
        }

        return new GmailApiTransport(
            new GmailService($client)
        );
    });

        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(120)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(5)
            ->by(Str::lower(trim((string) $request->input('email'))).'|'.$request->ip())
            ->response(fn () => response()->json([
                'message' => 'Too many login attempts. Please wait briefly and try again.',
                'code' => 'LOGIN_THROTTLED',
            ], 429)));

        RateLimiter::for('health', fn (Request $request) => Limit::perMinute(
            config('operations.health.rate_limit_per_minute')
        )->by($request->ip()));

        RateLimiter::for('referral-qr-resolve', fn (Request $request) => Limit::perMinute(60)
            ->by(($request->user()?->id ?: 'guest').'|'.$request->ip()));
        RateLimiter::for('referral-tracking-resolve', fn (Request $request) => Limit::perMinute(30)
            ->by(($request->user()?->id ?: 'guest').'|'.$request->ip()));
        RateLimiter::for('referral-qr-display', fn (Request $request) => Limit::perMinute(60)
            ->by(($request->user()?->id ?: 'guest').'|'.$request->ip()));
        RateLimiter::for('referral-qr-regenerate', fn (Request $request) => Limit::perMinute(10)
            ->by(($request->user()?->id ?: 'guest').'|'.$request->ip()));
        RateLimiter::for('form-drafts', fn (Request $request) => Limit::perMinute(config('form_drafts.write_limit'))->by('form-drafts:'.($request->user()?->id ?: $request->ip())));
        RateLimiter::for('health-record-drafts', fn (Request $request) => Limit::perMinute(
            config('health_record_drafts.write_rate_limit_per_minute')
        )->by(($request->user()?->id ?: 'guest').'|'.$request->ip()));
    }
}
