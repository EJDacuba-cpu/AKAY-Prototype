<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('follow_up_tasks', function (Blueprint $table): void {
            $table->foreignId('rural_health_unit_id')
                ->nullable()
                ->after('barangay_health_center_id')
                ->constrained('rural_health_units')
                ->nullOnDelete();
            $table->index(['rural_health_unit_id', 'state', 'due_date'], 'follow_up_tasks_rhu_state_due_index');
        });
    }

    public function down(): void
    {
        Schema::table('follow_up_tasks', function (Blueprint $table): void {
            $table->dropIndex('follow_up_tasks_rhu_state_due_index');
            $table->dropConstrainedForeignId('rural_health_unit_id');
        });
    }
};
