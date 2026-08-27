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
        'referral_hold_prune_time' => env('AKAY_REFERRAL_HOLD_PRUNE_TIME', '03:15'),
        'referral_hold_prune_overlap_minutes' => max(
            1,
            (int) env('AKAY_REFERRAL_HOLD_PRUNE_OVERLAP_MINUTES', 60)
        ),
        'follow_up_no_show_overlap_minutes' => max(
            1,
            (int) env('AKAY_FOLLOW_UP_NO_SHOW_OVERLAP_MINUTES', 60)
        ),
        'notification_prune_time' => env('AKAY_NOTIFICATION_PRUNE_TIME', '03:45'),
        'notification_prune_overlap_minutes' => max(
            1,
            (int) env('AKAY_NOTIFICATION_PRUNE_OVERLAP_MINUTES', 60)
        ),
    ],

    'referral_holds' => [
        'notify_cooldown_minutes' => max(
            1,
            (int) env('AKAY_REFERRAL_HOLD_NOTIFY_COOLDOWN_MINUTES', 15)
        ),
        'expire_after_days' => max(
            1,
            (int) env('AKAY_REFERRAL_HOLD_EXPIRE_AFTER_DAYS', 14)
        ),
    ],

    'notifications' => [
        // Decision D-6: matches health_record_drafts.terminal_retention_days
        // (the "already dismissed, kept briefly for recovery" window), not
        // its 30-day expiry_days (which governs a still-active phase this
        // table has no equivalent of).
        'cleared_retention_days' => max(
            1,
            (int) env('AKAY_NOTIFICATION_CLEARED_RETENTION_DAYS', 7)
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
