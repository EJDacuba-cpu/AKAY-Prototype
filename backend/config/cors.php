<?php

use App\Support\SecurityConfiguration;

$environment = (string) env('APP_ENV', 'production');
$localOrigins = $environment === 'local'
    ? 'http://localhost:5173,http://192.168.100.150:5173'
    : '';
$allowedOrigins = SecurityConfiguration::parseOrigins(
    env('AKAY_ALLOWED_ORIGINS', $localOrigins),
    env('FRONTEND_URL')
);

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => $allowedOrigins,

    'allowed_origins_patterns' => SecurityConfiguration::originPatterns($allowedOrigins),

    'allowed_headers' => [
        'Accept',
        'Content-Type',
        'Authorization',
        'Idempotency-Key',
        'X-Health-Record-Draft-ID',
        'X-AKAY-Session',
        'X-Requested-With',
    ],

    'exposed_headers' => [],

    'max_age' => 600,

    'supports_credentials' => true,
];
