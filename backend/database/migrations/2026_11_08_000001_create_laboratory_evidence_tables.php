<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monitoring_handoff_requests', function (Blueprint $table) {
            $table->unsignedInteger('laboratory_evidence_revision')->default(0);
        });
        Schema::create('laboratory_tests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->restrictOnDelete();
            $table->foreignId('health_record_id')->constrained()->restrictOnDelete();
            $table->uuid('client_id');
            $table->json('data');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['health_record_id', 'client_id']);
        });
        Schema::create('laboratory_addenda', function (Blueprint $table) {
            $table->id();
            $table->foreignId('laboratory_test_id')->constrained()->restrictOnDelete();
            $table->json('data');
            $table->text('reason');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });
        Schema::create('laboratory_attachments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('patient_id')->constrained()->restrictOnDelete();
            $table->foreignId('health_record_id')->nullable()->constrained()->restrictOnDelete();
            $table->uuid('consultation_uuid');
            $table->uuid('test_client_id');
            $table->string('disk');
            $table->string('path')->unique();
            $table->string('name');
            $table->string('mime_type', 100);
            $table->unsignedInteger('size');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('removed_at')->nullable();
            $table->timestamp('uploaded_at')->nullable();
            $table->timestamp('purged_at')->nullable();
            $table->timestamps();
            $table->index(['patient_id', 'consultation_uuid', 'test_client_id'], 'lab_attachment_consultation_index');
        });
        Schema::create('monitoring_laboratory_evidence', function (Blueprint $table) {
            $table->id();
            $table->foreignId('monitoring_handoff_request_id')->constrained()->restrictOnDelete();
            $table->foreignId('laboratory_test_id')->constrained()->restrictOnDelete();
            $table->foreignId('laboratory_addendum_id')->nullable()->constrained('laboratory_addenda')->restrictOnDelete();
            $table->json('attachment_ids');
            $table->foreignId('shared_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('shared_at');
            $table->timestamp('withdrawn_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monitoring_laboratory_evidence');
        Schema::dropIfExists('laboratory_attachments');
        Schema::dropIfExists('laboratory_addenda');
        Schema::dropIfExists('laboratory_tests');
        Schema::table('monitoring_handoff_requests', function (Blueprint $table) {
            $table->dropColumn('laboratory_evidence_revision');
        });
    }
};
