<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tb_dr_referrals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->restrictOnDelete();
            $table->foreignId('rural_health_unit_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('source_health_record_id');
            $table->json('patient_snapshot');
            $table->json('source_snapshot');
            $table->string('destination_name');
            $table->text('destination_address')->nullable();
            $table->string('destination_contact')->nullable();
            $table->text('reason');
            $table->enum('status', ['issued', 'sent', 'attendance_reported', 'cancelled'])->default('issued');
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('authorized_by')->constrained('users')->restrictOnDelete();
            $table->string('authorized_name');
            $table->timestampTz('authorized_at');
            $table->timestamps();
            $table->foreign(['source_health_record_id', 'patient_id', 'rural_health_unit_id'], 'tb_dr_referrals_source_fk')
                ->references(['id', 'patient_id', 'rural_health_unit_id'])->on('health_records')->restrictOnDelete();
            $table->index(['rural_health_unit_id', 'patient_id', 'id'], 'tb_dr_referrals_owner_index');
        });
        DB::statement("CREATE UNIQUE INDEX tb_dr_referrals_current_source_unique ON tb_dr_referrals (source_health_record_id) WHERE status <> 'cancelled'");
        Schema::create('tb_dr_referral_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tb_dr_referral_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->enum('status', ['issued', 'sent', 'attendance_reported', 'cancelled']);
            $table->text('note');
            $table->date('event_on');
            $table->foreignId('recorded_by')->constrained('users')->restrictOnDelete();
            $table->string('recorder_name');
            $table->timestampTz('recorded_at');
            $table->uuid('request_key')->unique();
            $table->string('request_hash', 64);
            $table->unique(['tb_dr_referral_id', 'version'], 'tb_dr_referral_event_version_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tb_dr_referral_events');
        Schema::dropIfExists('tb_dr_referrals');
    }
};
