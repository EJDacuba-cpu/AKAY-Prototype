<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('follow_up_tasks', function (Blueprint $table) {
            $table->timestamp('cancelled_at')->nullable()->after('rescheduled_at');
            $table->unique(
                'fulfilled_by_health_record_id',
                'follow_up_tasks_fulfilled_record_unique'
            );
            $table->index(
                [
                    'barangay_health_center_id',
                    'patient_id',
                    'state',
                    'due_date',
                ],
                'follow_up_tasks_patient_active_lookup_index'
            );
        });
    }

    public function down(): void
    {
        Schema::table('follow_up_tasks', function (Blueprint $table) {
            $table->dropIndex('follow_up_tasks_patient_active_lookup_index');
            $table->dropUnique('follow_up_tasks_fulfilled_record_unique');
            $table->dropColumn('cancelled_at');
        });
    }
};
