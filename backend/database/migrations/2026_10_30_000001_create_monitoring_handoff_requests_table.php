<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * RHU→BHC monitoring requests. Accepting a request never starts monitoring
 * and never changes patient ownership.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('monitoring_handoff_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->foreignId('linked_patient_id')->nullable()->constrained('patients')->nullOnDelete();
            $table->foreignId('patient_condition_id')->constrained()->cascadeOnDelete();
            $table->foreignId('health_record_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sending_rural_health_unit_id')->constrained('rural_health_units')->cascadeOnDelete();
            $table->foreignId('receiving_barangay_health_center_id')->constrained('barangay_health_centers')->cascadeOnDelete();
            $table->text('recommendation');
            $table->string('status', 40);
            $table->string('decline_reason', 1000)->nullable();
            $table->foreignId('redirected_to_bhc_id')->nullable()->constrained('barangay_health_centers')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['receiving_barangay_health_center_id', 'status'], 'mhr_receiving_status_idx');
            $table->index(['patient_id', 'status'], 'mhr_patient_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monitoring_handoff_requests');
    }
};
