<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tb_treatment_cases', function (Blueprint $table) {
            $table->string('outcome_status', 40)->nullable();
            $table->date('outcome_on')->nullable();
            $table->text('outcome_note')->nullable();
            $table->string('closed_name')->nullable();
            $table->timestampTz('closed_at')->nullable();
        });
        // Native ADD preserves SQLite's expression/partial indexes and existing
        // child FKs; a Blueprint-added FK rebuilds this populated case table.
        DB::statement('ALTER TABLE tb_treatment_cases ADD COLUMN closed_by BIGINT REFERENCES users(id) ON DELETE RESTRICT');
        Schema::create('tb_follow_up_labs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tb_treatment_case_id')->constrained()->restrictOnDelete();
            $table->enum('milestone', ['month_2', 'month_5', 'month_6', 'other']);
            $table->string('test_name');
            $table->date('due_on');
            $table->enum('status', ['requested', 'awaiting_result', 'result_available', 'cancelled']);
            $table->date('collection_on')->nullable();
            $table->date('examination_on')->nullable();
            $table->text('result')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
            $table->string('recorder_name');
            $table->timestampTz('recorded_at');
            $table->timestamps();
            $table->index(['tb_treatment_case_id', 'milestone', 'id'], 'tb_followup_case_milestone_index');
        });
        Schema::create('tb_case_clinical_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tb_treatment_case_id')->constrained()->restrictOnDelete();
            $table->foreignId('tb_follow_up_lab_id')->nullable()->constrained()->restrictOnDelete();
            $table->enum('kind', ['lab_saved', 'closed', 'reopened']);
            $table->unsignedInteger('case_version');
            $table->json('snapshot');
            $table->text('note');
            $table->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
            $table->string('recorder_name');
            $table->timestampTz('recorded_at');
            $table->uuid('request_key')->unique();
            $table->string('request_hash', 64);
            $table->unique(['tb_treatment_case_id', 'case_version'], 'tb_case_clinical_version_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tb_case_clinical_events');
        Schema::dropIfExists('tb_follow_up_labs');
        DB::statement('ALTER TABLE tb_treatment_cases DROP COLUMN closed_by');
        Schema::table('tb_treatment_cases', function (Blueprint $table) {
            $table->dropColumn(['outcome_status', 'outcome_on', 'outcome_note', 'closed_name', 'closed_at']);
        });
    }
};
