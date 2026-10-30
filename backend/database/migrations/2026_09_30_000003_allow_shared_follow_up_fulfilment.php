<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One consultation may now fulfil several continued follow-ups (Care Plan &
 * Next Steps), so fulfilled_by_health_record_id can no longer be unique.
 * The replay/lookup queries still need it indexed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('follow_up_tasks', function (Blueprint $table) {
            $table->dropUnique('follow_up_tasks_fulfilled_record_unique');
            $table->index('fulfilled_by_health_record_id', 'follow_up_tasks_fulfilled_record_index');
        });
    }

    public function down(): void
    {
        Schema::table('follow_up_tasks', function (Blueprint $table) {
            $table->dropIndex('follow_up_tasks_fulfilled_record_index');
            $table->unique('fulfilled_by_health_record_id', 'follow_up_tasks_fulfilled_record_unique');
        });
    }
};
