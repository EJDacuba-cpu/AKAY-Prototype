<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tb_monitoring_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tb_treatment_case_id')->constrained()->restrictOnDelete();
            $table->date('observed_on');
            $table->foreignId('barangay_health_center_id')->constrained()->restrictOnDelete();
            $table->foreignId('tb_case_endorsement_id')->constrained()->restrictOnDelete();
            $table->enum('dose_status', ['taken', 'missed', 'incomplete', 'on_hold', 'dispensed'])->nullable();
            $table->decimal('weight_kg', 6, 2)->nullable();
            $table->text('notes')->nullable();
            $table->boolean('voided')->default(false);
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
            $table->string('recorder_name');
            $table->timestampTz('recorded_at');
            $table->timestamps();
            $table->unique(['tb_treatment_case_id', 'observed_on'], 'tb_monitoring_case_date_unique');
        });
        Schema::create('tb_monitoring_revisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tb_monitoring_entry_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->json('values');
            $table->text('reason')->nullable();
            $table->foreignId('tb_case_endorsement_id')->constrained()->restrictOnDelete();
            $table->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
            $table->string('recorder_name');
            $table->timestampTz('recorded_at');
            $table->uuid('request_key')->unique();
            $table->string('request_hash', 64);
            $table->unique(['tb_monitoring_entry_id', 'version'], 'tb_monitoring_entry_version_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tb_monitoring_revisions');
        Schema::dropIfExists('tb_monitoring_entries');
    }
};
