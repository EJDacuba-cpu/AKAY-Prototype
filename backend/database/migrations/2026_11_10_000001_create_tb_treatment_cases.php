<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The composite FK below pins the case to the source patient and RHU.
        Schema::table('health_records', function (Blueprint $table) {
            $table->unique(['id', 'patient_id', 'rural_health_unit_id'], 'health_records_tb_source_identity');
        });

        Schema::create('tb_treatment_cases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->restrictOnDelete();
            $table->foreignId('rural_health_unit_id')->constrained()->restrictOnDelete();
            $table->foreignId('source_health_record_id')->unique();
            $table->unsignedSmallInteger('reporting_year');
            $table->string('case_number', 100);
            $table->enum('status', ['active', 'closed'])->default('active');
            $table->foreignId('registered_by')->constrained('users')->restrictOnDelete();
            $table->timestampTz('registered_at');
            $table->json('diagnosis_snapshot');
            $table->json('card_data');
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->foreign(['source_health_record_id', 'patient_id', 'rural_health_unit_id'], 'tb_cases_source_identity_fk')
                ->references(['id', 'patient_id', 'rural_health_unit_id'])->on('health_records')->restrictOnDelete();
            $table->index(['rural_health_unit_id', 'patient_id', 'registered_at'], 'tb_cases_owner_patient_index');
        });

        // PostgreSQL and SQLite both support expression and partial indexes.
        DB::statement('CREATE UNIQUE INDEX tb_cases_number_unique ON tb_treatment_cases (rural_health_unit_id, reporting_year, UPPER(TRIM(case_number)))');
        DB::statement("CREATE UNIQUE INDEX tb_cases_active_patient_unique ON tb_treatment_cases (patient_id) WHERE status = 'active'");

        Schema::create('tb_case_number_counters', function (Blueprint $table) {
            $table->foreignId('rural_health_unit_id')->constrained()->restrictOnDelete();
            $table->unsignedSmallInteger('reporting_year');
            $table->unsignedBigInteger('last_number')->default(0);
            $table->primary(['rural_health_unit_id', 'reporting_year']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tb_case_number_counters');
        Schema::dropIfExists('tb_treatment_cases');
        Schema::table('health_records', function (Blueprint $table) {
            $table->dropUnique('health_records_tb_source_identity');
        });
    }
};
