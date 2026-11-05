<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * SQLite only. Adding RHU foreign-key columns to health_record_drafts
 * (2026_10_25_000010) rebuilds the table on SQLite and recreates
 * health_record_drafts_owner_active_consultation_unique without its WHERE
 * clause. The earlier restore (2026_10_25_000001) runs before that rebuild, so
 * a discarded draft again blocks its consultation from being saved. PostgreSQL
 * alters in place and keeps the partial index, so this is a no-op there.
 */
return new class extends Migration
{
    private const UNIQUE_INDEX = 'health_record_drafts_owner_active_consultation_unique';

    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS '.self::UNIQUE_INDEX);
        DB::statement(
            'CREATE UNIQUE INDEX '.self::UNIQUE_INDEX.
            ' ON health_record_drafts (owner_user_id, consultation_uuid)'.
            " WHERE consultation_uuid IS NOT NULL AND status = 'active'"
        );
    }

    public function down(): void
    {
        // The partial index is the intended shape; there is nothing to restore.
    }
};
