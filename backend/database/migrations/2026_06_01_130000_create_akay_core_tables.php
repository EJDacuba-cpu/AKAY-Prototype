<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('barangay_health_centers', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('barangay')->nullable()->index();
            $table->text('address')->nullable();
            $table->string('contact_information')->nullable();
            $table->string('status')->default('active')->index();
            $table->timestamps();
        });

        Schema::create('rural_health_units', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->text('address')->nullable();
            $table->string('contact_information')->nullable();
            $table->string('status')->default('active')->index();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreign('barangay_health_center_id')->references('id')->on('barangay_health_centers')->nullOnDelete();
            $table->foreign('rural_health_unit_id')->references('id')->on('rural_health_units')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('patients', function (Blueprint $table) {
            $table->id();
            $table->string('first_name');
            $table->string('middle_name')->nullable();
            $table->string('last_name');
            $table->string('sex');
            $table->date('birthdate')->nullable();
            $table->string('contact_number')->nullable();
            $table->string('street_address')->nullable();
            $table->string('barangay')->nullable()->index();
            $table->string('municipality')->nullable();
            $table->string('civil_status')->nullable();
            $table->string('philhealth_number')->nullable()->index();
            $table->string('philhealth_category')->nullable();
            $table->string('patient_category')->nullable()->index();
            $table->string('status')->default('active')->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('barangay_health_center_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('rural_health_unit_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('health_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('barangay_health_center_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('rural_health_unit_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('date_recorded')->nullable()->index();
            $table->json('vital_signs')->nullable();
            $table->string('category')->nullable()->index();
            $table->text('chief_complaint')->nullable();
            $table->text('diagnosis')->nullable();
            $table->text('treatment_notes')->nullable();
            $table->text('medical_history')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('referrals', function (Blueprint $table) {
            $table->id();
            $table->string('tracking_id')->unique();
            $table->string('qr_code_value')->unique();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->foreignId('barangay_health_center_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rural_health_unit_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('referral_category')->nullable()->index();
            $table->string('urgency_level')->default('Normal')->index();
            $table->text('reason_for_referral');
            $table->text('chief_complaint')->nullable();
            $table->text('initial_diagnosis')->nullable();
            $table->text('initial_action_taken')->nullable();
            $table->string('referring_practitioner')->nullable();
            $table->dateTime('referral_datetime')->nullable()->index();
            $table->string('status')->default('Pending')->index();
            $table->text('remarks')->nullable();
            $table->timestamps();
        });

        Schema::create('referral_updates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('referral_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('previous_status')->nullable();
            $table->string('status')->index();
            $table->text('remarks')->nullable();
            $table->timestamps();
        });

        Schema::create('feedback', function (Blueprint $table) {
            $table->id();
            $table->foreignId('referral_id')->unique()->constrained()->cascadeOnDelete();
            $table->dateTime('received_at')->nullable();
            $table->text('rhu_diagnosis');
            $table->text('action_taken')->nullable();
            $table->text('treatment_notes')->nullable();
            $table->text('recommendation')->nullable();
            $table->string('receiving_practitioner')->nullable();
            $table->text('remarks')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('medicines', function (Blueprint $table) {
            $table->id();
            $table->string('name')->index();
            $table->string('category')->nullable()->index();
            $table->text('description')->nullable();
            $table->unsignedInteger('quantity')->default(0);
            $table->string('unit')->nullable();
            $table->string('availability_status')->default('Available')->index();
            $table->date('expiration_date')->nullable()->index();
            $table->foreignId('rural_health_unit_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('rhu_patient_volumes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rural_health_unit_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('status')->default('Normal')->index();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('message');
            $table->string('type')->nullable()->index();
            $table->boolean('is_read')->default(false)->index();
            $table->foreignId('related_referral_id')->nullable()->constrained('referrals')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action')->index();
            $table->string('module')->index();
            $table->text('description')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('rhu_patient_volumes');
        Schema::dropIfExists('medicines');
        Schema::dropIfExists('feedback');
        Schema::dropIfExists('referral_updates');
        Schema::dropIfExists('referrals');
        Schema::dropIfExists('health_records');
        Schema::dropIfExists('patients');

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['barangay_health_center_id']);
            $table->dropForeign(['rural_health_unit_id']);
            $table->dropForeign(['created_by']);
        });

        Schema::dropIfExists('rural_health_units');
        Schema::dropIfExists('barangay_health_centers');
    }
};
