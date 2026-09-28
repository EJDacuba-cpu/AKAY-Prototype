<?php
// backend/database/migrations/2026_09_29_000002_create_care_pathway_enrollment_conditions_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One condition inside a Care Pathway enrollment (e.g. "Hypertension" and
 * "Diabetes Mellitus" both inside one NCD Monitoring enrollment). Removing a
 * condition is a soft end (removed_health_record_id/removed_at), never a
 * delete, so the enrollment's history stays intact.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('care_pathway_enrollment_conditions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enrollment_id')->constrained('care_pathway_enrollments')->cascadeOnDelete();
            $table->string('condition_name', 150); // the diagnosis text, as typed
            // The pathway's chosen field set (config/care_pathways.php field_sets
            // key), e.g. "diabetes_monitoring". Null means "None" - no
            // specialized form verified/chosen for this condition yet.
            $table->string('field_set_key', 50)->nullable();
            // The diagnosis entry's id this came from - traceability only, not
            // a foreign key (diagnoses live in health_records.diagnoses JSON).
            $table->string('diagnosis_ref', 64)->nullable();
            $table->foreignId('added_health_record_id')->constrained('health_records')->cascadeOnDelete();
            $table->foreignId('removed_health_record_id')->nullable()
                ->constrained('health_records')->nullOnDelete();
            $table->timestamp('removed_at')->nullable();
            $table->timestamps();

            $table->index(['enrollment_id', 'removed_at'], 'care_pathway_enrollment_conditions_active_idx');
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE public.care_pathway_enrollment_conditions ENABLE ROW LEVEL SECURITY');
    }

    public function down(): void
    {
        Schema::dropIfExists('care_pathway_enrollment_conditions');
    }
};
