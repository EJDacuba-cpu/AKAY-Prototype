<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('follow_up_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('health_record_id')->constrained('health_records')->cascadeOnDelete();
            $table->foreignId('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignId('barangay_health_center_id')->nullable()->constrained('barangay_health_centers')->nullOnDelete();
            $table->date('due_date');
            $table->string('state')->default('pending');
            $table->text('notes')->nullable();
            $table->timestamp('no_show_at')->nullable();
            $table->timestamp('rescheduled_at')->nullable();
            $table->timestamp('fulfilled_at')->nullable();
            $table->foreignId('fulfilled_by_health_record_id')->nullable()->constrained('health_records')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique('health_record_id');
            $table->index(['barangay_health_center_id', 'state', 'due_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('follow_up_tasks');
    }
};
