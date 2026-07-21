<?php

use App\Support\SecurityConfiguration;

$environment = (string) env('APP_ENV', 'production');
$isLocal = $environment === 'local';
$securityHeadersEnabled = filter_var(
    env('AKAY_SECURITY_HEADERS_ENABLED', true),
    FILTER_VALIDATE_BOOL
);
$configuredCspMode = strtolower(trim((string) env('AKAY_CSP_MODE', '')));

if ($configuredCspMode === '') {
    $configuredCspMode = filter_var(env('AKAY_CSP_REPORT_ONLY', false), FILTER_VALIDATE_BOOL)
        ? 'report-only'
        : ($isLocal ? 'report-only' : 'enforce');
}

if (! in_array($configuredCspMode, ['enforce', 'report-only', 'disabled'], true)) {
    throw new InvalidArgumentException(
        'AKAY_CSP_MODE must be enforce, report-only, or disabled.'
    );
}

$connectOrigins = SecurityConfiguration::parseOrigins(
    SecurityConfiguration::originFromUrl(env('APP_URL')),
    env('AKAY_CSP_CONNECT_ORIGINS')
);
$connectSources = array_merge(["'self'"], $connectOrigins);

if ($isLocal) {
    $connectSources = array_merge($connectSources, ['ws:', 'wss:']);
}

$cspPolicy = implode(' ', [
    "default-src 'self';",
    "base-uri 'self';",
    "object-src 'none';",
    "frame-ancestors 'none';",
    "form-action 'self';",
    "script-src 'self';",
    "style-src 'self' 'unsafe-inline';",
    "img-src 'self' data: blob:;",
    "font-src 'self';",
    'connect-src '.implode(' ', array_unique($connectSources)).';',
    "media-src 'self' blob:;",
    "worker-src 'self' blob:;",
    "manifest-src 'self';",
]);

return [
    'headers_enabled' => $securityHeadersEnabled,

    'frontend_url' => SecurityConfiguration::originFromUrl(env('FRONTEND_URL')),

    'trusted_hosts' => SecurityConfiguration::trustedHostPatterns(
        env('AKAY_TRUSTED_HOSTS'),
        env('APP_URL')
    ),

    'trusted_proxies' => SecurityConfiguration::parseTrustedProxies(
        env('AKAY_TRUSTED_PROXIES')
    ),

    'https_redirect_enabled' => filter_var(
        env('AKAY_HTTPS_REDIRECT_ENABLED', false),
        FILTER_VALIDATE_BOOL
    ),

    'hsts' => [
        'enabled' => filter_var(env('AKAY_HSTS_ENABLED', false), FILTER_VALIDATE_BOOL),
        'max_age' => max(0, (int) env('AKAY_HSTS_MAX_AGE', 31536000)),
        'include_subdomains' => filter_var(
            env('AKAY_HSTS_INCLUDE_SUBDOMAINS', true),
            FILTER_VALIDATE_BOOL
        ),
    ],

    'csp' => [
        'mode' => $securityHeadersEnabled ? $configuredCspMode : 'disabled',
        'policy' => $cspPolicy,
    ],
];
