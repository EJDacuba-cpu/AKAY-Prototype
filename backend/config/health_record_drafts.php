<?php

return [
    'expiry_days' => max(1, (int) env('AKAY_HEALTH_RECORD_DRAFT_EXPIRY_DAYS', 30)),
    'terminal_retention_days' => max(
        1,
        (int) env('AKAY_HEALTH_RECORD_DRAFT_RETENTION_DAYS', 7)
    ),
    'max_active_per_user' => min(
        20,
        max(1, (int) env('AKAY_HEALTH_RECORD_DRAFT_MAX_ACTIVE', 20))
    ),
    'max_payload_bytes' => min(
        262144,
        max(1024, (int) env('AKAY_HEALTH_RECORD_DRAFT_MAX_BYTES', 262144))
    ),
    'list_per_page' => min(
        15,
        max(1, (int) env('AKAY_HEALTH_RECORD_DRAFT_LIST_PER_PAGE', 15))
    ),
    'write_rate_limit_per_minute' => max(
        1,
        (int) env('AKAY_HEALTH_RECORD_DRAFT_WRITE_RATE_LIMIT', 30)
    ),
];
