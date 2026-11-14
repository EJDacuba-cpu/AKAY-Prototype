<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Service-based Manage to BHC reuses monitoring_handoff_requests without
 * inventing PatientCondition rows for Maternal / EPI / FP / Nutrition.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monitoring_handoff_requests', function (Blueprint $table) {
            $table->string('handoff_kind', 20)->default('condition')->after('linked_patient_id');
            $table->string('service_key', 40)->nullable()->after('handoff_kind');
        });

        Schema::table('monitoring_handoff_requests', function (Blueprint $table) {
            $table->dropForeign(['patient_condition_id']);
        });

        Schema::table('monitoring_handoff_requests', function (Blueprint $table) {
            $table->unsignedBigInteger('patient_condition_id')->nullable()->change();
            $table->foreign('patient_condition_id')
                ->references('id')
                ->on('patient_conditions')
                ->nullOnDelete();
            $table->index(['handoff_kind', 'service_key', 'status'], 'mhr_kind_service_status_idx');
        });

        // Existing rows are condition handoffs.
        DB::table('monitoring_handoff_requests')
            ->whereNull('handoff_kind')
            ->orWhere('handoff_kind', '')
            ->update(['handoff_kind' => 'condition']);
    }

    public function down(): void
    {
        Schema::table('monitoring_handoff_requests', function (Blueprint $table) {
            $table->dropIndex('mhr_kind_service_status_idx');
            $table->dropForeign(['patient_condition_id']);
        });

        // Cannot safely restore NOT NULL if service rows exist.
        Schema::table('monitoring_handoff_requests', function (Blueprint $table) {
            $table->unsignedBigInteger('patient_condition_id')->nullable(false)->change();
            $table->foreign('patient_condition_id')
                ->references('id')
                ->on('patient_conditions')
                ->cascadeOnDelete();
            $table->dropColumn(['handoff_kind', 'service_key']);
        });
    }
};
