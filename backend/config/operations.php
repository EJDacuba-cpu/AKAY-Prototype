<?php

return [
    'scheduler' => [
        'no_show_overlap_minutes' => max(
            1,
            (int) env('AKAY_NO_SHOW_OVERLAP_MINUTES', 60)
        ),
        'token_prune_time' => env('AKAY_TOKEN_PRUNE_TIME', '02:15'),
        'token_prune_retention_hours' => max(
            0,
            (int) env('AKAY_TOKEN_PRUNE_RETENTION_HOURS', 24)
        ),
        'token_prune_overlap_minutes' => max(
            1,
            (int) env('AKAY_TOKEN_PRUNE_OVERLAP_MINUTES', 120)
        ),
        'draft_prune_time' => env('AKAY_DRAFT_PRUNE_TIME', '02:45'),
        'draft_prune_overlap_minutes' => max(
            1,
            (int) env('AKAY_DRAFT_PRUNE_OVERLAP_MINUTES', 120)
        ),
    ],

    'health' => [
        'rate_limit_per_minute' => max(
            1,
            (int) env('AKAY_HEALTH_RATE_LIMIT_PER_MINUTE', 30)
        ),
    ],

    'deployment' => [
        'maximum_token_expiration_minutes' => min(
            525600,
            max(1, (int) env('AKAY_MAX_TOKEN_EXPIRATION_MINUTES', 43200))
        ),
    ],
];
