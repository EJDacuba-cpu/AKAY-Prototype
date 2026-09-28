<?php
// backend/database/migrations/2026_09_29_000004_create_care_pathway_enrollment_follow_up_task_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Which Care Pathway enrollments a scheduled follow_up_tasks row is for,
 * populated only from the Disposition step's explicit "This follow-up is
 * for:" checklist (never automatic). A visit opened from a linked task
 * auto-links itself to exactly these enrollments as a "continued" encounter.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('care_pathway_enrollment_follow_up_task', function (Blueprint $table) {
            $table->foreignId('enrollment_id')->constrained('care_pathway_enrollments')->cascadeOnDelete();
            $table->foreignId('follow_up_task_id')->constrained()->cascadeOnDelete();
            $table->primary(['enrollment_id', 'follow_up_task_id']);
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE public.care_pathway_enrollment_follow_up_task ENABLE ROW LEVEL SECURITY');
    }

    public function down(): void
    {
        Schema::dropIfExists('care_pathway_enrollment_follow_up_task');
    }
};
