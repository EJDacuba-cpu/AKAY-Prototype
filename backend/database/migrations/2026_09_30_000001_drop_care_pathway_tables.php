<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Retires the Care Pathway enrollment layer (NCD / TB-DOTS "pathways"). The
 * consultation is moving to per-diagnosis care planning, and these tables -
 * created by the 2026_09_29_00000{1-4} migrations, since deleted - never held
 * a row. dropIfExists keeps a fresh database, which never created them, a
 * no-op. Dropped children first so the foreign keys never block.
 *
 * There is no down(): nothing wrote to these tables, and the design that
 * needed them is gone.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('care_pathway_enrollment_follow_up_task');
        Schema::dropIfExists('care_pathway_encounters');
        Schema::dropIfExists('care_pathway_enrollment_conditions');
        Schema::dropIfExists('care_pathway_enrollments');
    }

    public function down(): void
    {
        //
    }
};
