<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // No domain/user FKs: acquiring this boundary must not first lock those rows.
        // The UUID exists before a server clinical draft; terminal tombstones survive pruning.
        Schema::create('clinical_recovery_identities', function (Blueprint $table) {
            $table->uuid('consultation_uuid')->primary();
            $table->string('facility_scope', 100)->nullable();
            $table->string('context_key', 160)->nullable();
            $table->string('status', 20)->default('active');
            $table->timestampsTz();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_recovery_identities');
    }
};
