<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ApplySecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! config('security.headers_enabled')) {
            return $response;
        }

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set(
            'Permissions-Policy',
            'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
        );
        $response->headers->set('Cross-Origin-Opener-Policy', 'same-origin');

        $this->applyContentSecurityPolicy($response);
        $this->applyStrictTransportSecurity($request, $response);

        return $response;
    }

    private function applyContentSecurityPolicy(Response $response): void
    {
        $mode = config('security.csp.mode');
        $policy = config('security.csp.policy');

        if ($mode === 'disabled' || ! is_string($policy) || $policy === '') {
            return;
        }

        $header = $mode === 'report-only'
            ? 'Content-Security-Policy-Report-Only'
            : 'Content-Security-Policy';

        $response->headers->set($header, $policy);
    }

    private function applyStrictTransportSecurity(Request $request, Response $response): void
    {
        if (config('app.env') !== 'production'
            || ! config('security.hsts.enabled')
            || ! $request->isSecure()) {
            return;
        }

        $value = 'max-age='.(int) config('security.hsts.max_age', 31536000);

        if (config('security.hsts.include_subdomains')) {
            $value .= '; includeSubDomains';
        }

        $response->headers->set('Strict-Transport-Security', $value);
    }
}
