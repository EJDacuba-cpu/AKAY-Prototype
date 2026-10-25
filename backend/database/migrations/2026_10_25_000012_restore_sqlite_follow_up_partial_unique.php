<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * SQLite only. Adding rural_health_unit_id (2026_10_25_000011) rebuilds
 * follow_up_tasks on SQLite and recreates health_record_id uniqueness without
 * the WHERE rescheduled_to_id IS NULL clause from 2026_09_18_000002. A
 * reschedule then cannot insert the replacement row. PostgreSQL alters in
 * place and keeps the partial index, so this is a no-op there.
 */
return new class extends Migration
{
    private const FULL_UNIQUE = 'follow_up_tasks_health_record_id_unique';

    private const PARTIAL_UNIQUE = 'follow_up_tasks_active_health_record_unique';

    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS '.self::FULL_UNIQUE);
        DB::statement('DROP INDEX IF EXISTS '.self::PARTIAL_UNIQUE);
        DB::statement(
            'CREATE UNIQUE INDEX '.self::PARTIAL_UNIQUE
            .' ON follow_up_tasks (health_record_id) WHERE rescheduled_to_id IS NULL'
        );
    }

    public function down(): void
    {
        // The partial index is the intended shape; there is nothing to restore.
    }
};
