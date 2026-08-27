<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Decision C2 (notification-system-remediation-implementation.md) - the hot
 * query behind NotificationController::index() is
 * WHERE user_id = ? AND cleared_at IS NULL ORDER BY created_at DESC, and
 * PostgreSQL does not auto-index foreign keys the way MySQL does. This table
 * had no index on user_id at all before this migration.
 *
 * A partial index, not a general composite one, because "cleared_at IS NULL"
 * is the only branch this query ever takes - a full composite index would
 * carry rows this query never touches.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            'CREATE INDEX notifications_user_unresolved_idx '
            .'ON notifications (user_id, created_at DESC) WHERE cleared_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS notifications_user_unresolved_idx');
    }
};
