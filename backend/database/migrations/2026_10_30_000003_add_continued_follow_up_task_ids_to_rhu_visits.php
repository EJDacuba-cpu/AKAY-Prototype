<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Persist the follow-up tasks selected when an RHU visit starts, so Staff and
 * Doctor resume the same encounter context without a second queue row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rhu_visit_queue_entries', function (Blueprint $table) {
            $table->json('continued_follow_up_task_ids')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('rhu_visit_queue_entries', function (Blueprint $table) {
            $table->dropColumn('continued_follow_up_task_ids');
        });
    }
};
