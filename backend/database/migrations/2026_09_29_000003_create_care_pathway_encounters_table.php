<?php
// backend/database/migrations/2026_09_29_000003_create_care_pathway_encounters_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only: which health record visits belong to a Care Pathway
 * enrollment, and (for a generic pathway like NCD) that visit's field-set
 * values. A "legacy_linked" row only POINTS AT an old, unmodified TB record
 * - it never carries field_data and the linked record is never edited.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('care_pathway_encounters', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enrollment_id')->constrained('care_pathway_enrollments')->cascadeOnDelete();
            $table->foreignId('health_record_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 20); // started|continued|legacy_linked
            $table->json('field_data')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['enrollment_id', 'health_record_id'], 'care_pathway_encounters_enrollment_record_unique');
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(
            'ALTER TABLE public.care_pathway_encounters ADD CONSTRAINT care_pathway_encounters_kind_check '
            ."CHECK (kind IN ('started', 'continued', 'legacy_linked'))"
        );
        DB::statement('ALTER TABLE public.care_pathway_encounters ENABLE ROW LEVEL SECURITY');
    }

    public function down(): void
    {
        Schema::dropIfExists('care_pathway_encounters');
    }
};
