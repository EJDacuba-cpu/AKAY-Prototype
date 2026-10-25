<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Independent follow-up tasks per originating consultation and purpose.
 *
 * Additive only: existing rows receive purpose_key = 'visit', so the previous
 * one-current-task-per-health-record uniqueness is preserved for legacy data.
 * The partial unique index becomes (health_record_id, purpose_key) WHERE
 * rescheduled_to_id IS NULL, which is valid on both PostgreSQL and SQLite.
 */
return new class extends Migration
{
    private const OLD_PARTIAL = 'follow_up_tasks_active_health_record_unique';

    private const OLD_FULL = 'follow_up_tasks_health_record_id_unique';

    private const NEW_PARTIAL = 'follow_up_tasks_active_source_purpose_unique';

    public function up(): void
    {
        Schema::table('follow_up_tasks', function (Blueprint $table): void {
            if (! Schema::hasColumn('follow_up_tasks', 'purpose')) {
                $table->string('purpose', 150)->nullable()->after('due_time');
            }
            if (! Schema::hasColumn('follow_up_tasks', 'purpose_key')) {
                $table->string('purpose_key', 64)->default('visit')->after('purpose');
            }
            if (! Schema::hasColumn('follow_up_tasks', 'source_entry_id')) {
                $table->string('source_entry_id', 64)->nullable()->after('purpose_key');
            }
            if (! Schema::hasColumn('follow_up_tasks', 'predecessor_task_id')) {
                $table->foreignId('predecessor_task_id')
                    ->nullable()
                    ->after('rescheduled_to_id')
                    ->constrained('follow_up_tasks')
                    ->nullOnDelete();
            }
        });

        DB::table('follow_up_tasks')
            ->where(function ($query): void {
                $query->whereNull('purpose_key')->orWhere('purpose_key', '');
            })
            ->update(['purpose_key' => 'visit']);

        DB::statement('DROP INDEX IF EXISTS '.self::OLD_PARTIAL);
        DB::statement('DROP INDEX IF EXISTS '.self::OLD_FULL);
        DB::statement(
            'CREATE UNIQUE INDEX '.self::NEW_PARTIAL
            .' ON follow_up_tasks (health_record_id, purpose_key) WHERE rescheduled_to_id IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS '.self::NEW_PARTIAL);
        DB::statement(
            'CREATE UNIQUE INDEX '.self::OLD_PARTIAL
            .' ON follow_up_tasks (health_record_id) WHERE rescheduled_to_id IS NULL'
        );

        Schema::table('follow_up_tasks', function (Blueprint $table): void {
            if (Schema::hasColumn('follow_up_tasks', 'predecessor_task_id')) {
                $table->dropConstrainedForeignId('predecessor_task_id');
            }
            foreach (['source_entry_id', 'purpose_key', 'purpose'] as $column) {
                if (Schema::hasColumn('follow_up_tasks', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
