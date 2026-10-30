<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 5: close-visit audit columns and one consultation identity per visit.
 * Additive. Avoid SQLite table rebuilds (a foreign-key add drops partial unique
 * indexes), so closed_by is a nullable user id with a PostgreSQL FK only.
 */
return new class extends Migration
{
    private const UUID_UNIQUE = 'rhu_visit_queue_entries_consultation_uuid_unique';

    private const ACTIVE_PATIENT_UNIQUE = 'rhu_visit_queue_entries_active_patient_unique';

    private const SOURCE_RULE = "source IN ('referral', 'walk_in') AND (source = 'walk_in' OR referral_id IS NOT NULL)";

    public function up(): void
    {
        Schema::table('rhu_visit_queue_entries', function (Blueprint $table) {
            $table->unsignedBigInteger('closed_by')->nullable();
            $table->string('close_reason', 40)->nullable();
            $table->text('close_note')->nullable();
            $table->uuid('consultation_uuid')->nullable();
            $table->index('closed_by', 'rhu_visit_queue_entries_closed_by_idx');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE rhu_visit_queue_entries ADD CONSTRAINT rhu_visit_queue_entries_closed_by_foreign FOREIGN KEY (closed_by) REFERENCES users (id) ON DELETE SET NULL');
        }

        DB::statement(
            'CREATE UNIQUE INDEX '.self::UUID_UNIQUE.
            ' ON rhu_visit_queue_entries (consultation_uuid) WHERE consultation_uuid IS NOT NULL'
        );

        if (DB::getDriverName() === 'sqlite') {
            $this->restoreSqlitePartialUnique();
            $this->restoreSqliteSourceTriggers();
        }
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS '.self::UUID_UNIQUE);
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE rhu_visit_queue_entries DROP CONSTRAINT IF EXISTS rhu_visit_queue_entries_closed_by_foreign');
        }
        Schema::table('rhu_visit_queue_entries', function (Blueprint $table) {
            $table->dropIndex('rhu_visit_queue_entries_closed_by_idx');
            $table->dropColumn(['closed_by', 'close_reason', 'close_note', 'consultation_uuid']);
        });
    }

    private function restoreSqlitePartialUnique(): void
    {
        DB::statement('DROP INDEX IF EXISTS '.self::ACTIVE_PATIENT_UNIQUE);
        DB::statement(
            'CREATE UNIQUE INDEX '.self::ACTIVE_PATIENT_UNIQUE.
            ' ON rhu_visit_queue_entries (rural_health_unit_id, patient_id) WHERE closed_at IS NULL'
        );
    }

    private function restoreSqliteSourceTriggers(): void
    {
        $rule = str_replace(['source', 'referral_id'], ['NEW.source', 'NEW.referral_id'], self::SOURCE_RULE);
        foreach (['INSERT', 'UPDATE'] as $event) {
            DB::statement("DROP TRIGGER IF EXISTS rhu_visit_queue_entries_source_{$event}");
            DB::unprepared(
                "CREATE TRIGGER rhu_visit_queue_entries_source_{$event} BEFORE {$event} ON rhu_visit_queue_entries WHEN NOT ({$rule}) BEGIN SELECT RAISE(ABORT, 'Invalid visit source'); END"
            );
        }
    }
};
