<?php
// backend/database/migrations/2026_09_29_000001_create_care_pathway_enrollments_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A patient's enrollment in one configured Care Pathway (config/care_pathways.php),
 * e.g. "ncd" or "tb_dots". One row per (patient, pathway) that has ever been
 * started - status moves active -> completed|discontinued, never deleted.
 *
 * Written to ONLY from CarePathwayActivationService, inside the same
 * DB::transaction() that creates the health_records row which started or
 * continued it (see HealthRecordController::store). Never created by a
 * standalone API call.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('care_pathway_enrollments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->string('pathway_key', 50); // a config/care_pathways.php key, e.g. "ncd"
            $table->string('status', 20)->default('active'); // active|completed|discontinued
            $table->foreignId('barangay_health_center_id')->constrained()->cascadeOnDelete();
            $table->foreignId('started_health_record_id')->constrained('health_records')->cascadeOnDelete();
            $table->timestamp('started_at');
            $table->foreignId('ended_health_record_id')->nullable()
                ->constrained('health_records')->nullOnDelete();
            $table->timestamp('ended_at')->nullable();
            $table->string('end_reason', 500)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['patient_id', 'pathway_key'], 'care_pathway_enrollments_patient_pathway_idx');
        });

        // One active enrollment per patient per pathway - the database is the
        // one place this is truly guaranteed, since two concurrent "start"
        // requests can both pass an application-level check.
        // Both PostgreSQL and SQLite support partial indexes; the schema builder
        // has no API for the WHERE clause, so this is raw on purpose.
        DB::statement(
            'CREATE UNIQUE INDEX care_pathway_enrollments_one_active_idx '
            .'ON care_pathway_enrollments (patient_id, pathway_key) '
            ."WHERE status = 'active'"
        );

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(
            'ALTER TABLE public.care_pathway_enrollments ADD CONSTRAINT care_pathway_enrollments_status_check '
            ."CHECK (status IN ('active', 'completed', 'discontinued'))"
        );

        // Phase 2B posture (docs/database-exposure-containment.md): every
        // table created after that migration ran must enable RLS itself.
        DB::statement('ALTER TABLE public.care_pathway_enrollments ENABLE ROW LEVEL SECURITY');
    }

    public function down(): void
    {
        Schema::dropIfExists('care_pathway_enrollments');
    }
};
