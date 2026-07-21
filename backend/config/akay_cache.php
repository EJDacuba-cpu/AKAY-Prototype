<?php

return [
    'enabled' => env('AKAY_SERVER_CACHE_ENABLED', true),

    'ttl' => [
        'medicine_availability_seconds' => (int) env(
            'AKAY_CACHE_MEDICINE_AVAILABILITY_SECONDS',
            20
        ),
        'report_aggregate_seconds' => (int) env(
            'AKAY_CACHE_REPORT_AGGREGATE_SECONDS',
            120
        ),
    ],
];
