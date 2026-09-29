<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BHC monitoring of one patient condition, started/continued/stopped only by
 * saving a consultation (HealthRecordController::store, same transaction).
 * Separate from medical_background.currentDiseases, which owns the clinical
 * status (Active / Controlled / Resolved). See
 * docs/superpowers/specs/2026-09-30-care-plan-next-steps-design.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('condition_monitorings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->foreignId('barangay_health_center_id')->constrained()->cascadeOnDelete();
            $table->string('condition_key', 64)->nullable();
            $table->string('condition_name', 150);
            // conditionKey, else "name:" + normalized name - what "same condition" means.
            $table->string('condition_identity', 160);
            $table->string('status', 20)->default('active'); // active|stopped
            $table->foreignId('started_health_record_id')->constrained('health_records')->cascadeOnDelete();
            $table->timestamp('started_at');
            $table->foreignId('stopped_health_record_id')->nullable()->constrained('health_records')->nullOnDelete();
            $table->timestamp('stopped_at')->nullable();
            $table->string('stop_reason', 500)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['patient_id', 'status'], 'condition_monitorings_patient_status_idx');
        });

        // The database is the one place "one active record per patient and
        // condition" is truly guaranteed. Partial indexes work on PostgreSQL and
        // SQLite; the schema builder has no API for the WHERE clause.
        DB::statement(
            'CREATE UNIQUE INDEX condition_monitorings_one_active_idx '
            .'ON condition_monitorings (patient_id, condition_identity) '
            ."WHERE status = 'active'"
        );

        Schema::create('condition_monitoring_visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('condition_monitoring_id')->constrained()->cascadeOnDelete();
            $table->foreignId('health_record_id')->constrained()->cascadeOnDelete();
            $table->string('action', 20); // started|continued|stopped
            $table->boolean('referred')->default(false);
            $table->timestamp('created_at');

            $table->unique(['condition_monitoring_id', 'health_record_id'], 'condition_monitoring_visits_unique');
        });

        Schema::create('condition_monitoring_follow_up_task', function (Blueprint $table) {
            $table->foreignId('condition_monitoring_id')->constrained()->cascadeOnDelete();
            $table->foreignId('follow_up_task_id')->constrained()->cascadeOnDelete();

            $table->primary(['condition_monitoring_id', 'follow_up_task_id']);
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement("ALTER TABLE public.condition_monitorings ADD CONSTRAINT condition_monitorings_status_check CHECK (status IN ('active', 'stopped'))");
        DB::statement("ALTER TABLE public.condition_monitoring_visits ADD CONSTRAINT condition_monitoring_visits_action_check CHECK (action IN ('started', 'continued', 'stopped'))");
        foreach (['condition_monitorings', 'condition_monitoring_visits', 'condition_monitoring_follow_up_task'] as $table) {
            DB::statement("ALTER TABLE public.$table ENABLE ROW LEVEL SECURITY");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('condition_monitoring_follow_up_task');
        Schema::dropIfExists('condition_monitoring_visits');
        Schema::dropIfExists('condition_monitorings');
    }
};
