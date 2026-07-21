<?php

$environment = (string) env('APP_ENV', 'production');
$sameSite = strtolower((string) env('AKAY_AUTH_COOKIE_SAME_SITE', 'lax'));
$secure = $environment === 'production'
    || filter_var(env('AKAY_AUTH_COOKIE_SECURE', false), FILTER_VALIDATE_BOOL);
if ($sameSite === 'none' && ! $secure) {
    $sameSite = 'lax';
}

return [
    'access_token_minutes' => min(
        60,
        max(5, (int) env('AKAY_AUTH_ACCESS_TOKEN_MINUTES', 15))
    ),
    'refresh_token_minutes' => min(
        1440,
        max(30, (int) env('AKAY_AUTH_REFRESH_TOKEN_MINUTES', 480))
    ),
    'refresh_idle_minutes' => min(
        480,
        max(15, (int) env('AKAY_AUTH_REFRESH_IDLE_MINUTES', 120))
    ),
    'cookie' => [
        'name' => 'akay_refresh_session',
        'path' => '/api/auth',
        'domain' => env('AKAY_AUTH_COOKIE_DOMAIN') ?: null,
        'secure' => $secure,
        'http_only' => true,
        'same_site' => in_array($sameSite, ['lax', 'strict', 'none'], true)
            ? $sameSite
            : 'lax',
    ],
];
