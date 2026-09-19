<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Follow-up Module plan, Part B.1/B.2: a follow-up's due date must never
 * move, and the Calendar view must keep showing entries a reschedule has
 * superseded (Part A.5 Principle 4, Part A.4.4). The previous
 * reschedule() implementation overwrote due_date on the same row, which
 * contradicts both.
 *
 * `rescheduled_to_id` is what makes "current/active" derivable without a
 * second stored flag: NULL means this row is the newest entry for its
 * health_record_id. FollowUpTaskController::index() filters on it (List =
 * only current); the new /follow-up-tasks/calendar endpoint does not
 * (Calendar = full history, superseded rows included).
 *
 * The partial unique index (not a plain unique(health_record_id), which
 * this replaces) is what allows a superseded row and its replacement to
 * coexist under the same health_record_id while still preventing two
 * simultaneously-active rows for the same record. Laravel's schema builder
 * has no fluent method for a partial index, hence the raw statement - the
 * syntax below is valid on both pgsql (production) and sqlite (tests).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('follow_up_tasks', function (Blueprint $table) {
            $table->foreignId('rescheduled_to_id')->nullable()->after('cancelled_at')
                ->constrained('follow_up_tasks')->nullOnDelete();
            $table->dropUnique('follow_up_tasks_health_record_id_unique');
        });

        DB::statement(
            'CREATE UNIQUE INDEX follow_up_tasks_active_health_record_unique '
            .'ON follow_up_tasks (health_record_id) WHERE rescheduled_to_id IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS follow_up_tasks_active_health_record_unique');

        Schema::table('follow_up_tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('rescheduled_to_id');
            $table->unique('health_record_id', 'follow_up_tasks_health_record_id_unique');
        });
    }
};
