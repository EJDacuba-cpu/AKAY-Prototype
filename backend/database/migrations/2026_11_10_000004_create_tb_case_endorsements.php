<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tb_case_endorsements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tb_treatment_case_id')->constrained()->restrictOnDelete();
            $table->foreignId('receiving_bhc_id')->constrained('barangay_health_centers')->restrictOnDelete();
            $table->foreignId('linked_patient_id')->nullable()->constrained('patients')->restrictOnDelete();
            $table->json('patient_snapshot');
            $table->text('note');
            $table->enum('status', ['linkage_needed', 'pending_review', 'accepted', 'declined', 'revoked']);
            $table->text('reason')->nullable();
            $table->foreignId('endorsed_by')->constrained('users')->restrictOnDelete();
            $table->timestampTz('endorsed_at');
            foreach (['linked', 'reviewed', 'revoked'] as $event) {
                $table->foreignId($event.'_by')->nullable()->constrained('users')->restrictOnDelete();
                $table->timestampTz($event.'_at')->nullable();
            }
            $table->unsignedInteger('version')->default(1);
            $table->uuid('request_key')->unique();
            $table->string('request_hash', 64);
            $table->timestamps();
            $table->index(['receiving_bhc_id', 'status', 'id'], 'tb_endorsements_recipient_index');
            $table->index('linked_patient_id');
        });
        DB::statement("CREATE UNIQUE INDEX tb_endorsements_active_case_unique ON tb_case_endorsements (tb_treatment_case_id) WHERE status IN ('linkage_needed', 'pending_review', 'accepted')");
    }

    public function down(): void
    {
        Schema::dropIfExists('tb_case_endorsements');
    }
};
