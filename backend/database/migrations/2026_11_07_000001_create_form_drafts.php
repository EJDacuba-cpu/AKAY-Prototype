<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('form_drafts', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('scope', 100);
            $table->string('form_type', 80);
            $table->string('mode', 10);
            $table->string('context_key', 160);
            $table->uuid('transaction_uuid');
            $table->string('active_slot', 64)->nullable()->unique();
            $table->unsignedInteger('schema_version')->default(1);
            $table->unsignedInteger('version')->default(1);
            $table->string('status', 20)->default('active');
            $table->text('encrypted_payload')->nullable();
            $table->text('encrypted_base_revision')->nullable();
            $table->string('payload_hash', 64);
            $table->timestampTz('last_saved_at');
            $table->timestampTz('expires_at')->index();
            $table->string('commit_hash', 64)->nullable();
            $table->text('encrypted_result')->nullable();
            $table->unsignedSmallInteger('result_status')->nullable();
            $table->timestampsTz();
            $table->unique(['user_id', 'transaction_uuid']);
            $table->index(['user_id', 'scope', 'form_type']);
        });
        Schema::create('form_draft_recovery_keys', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('form_type', 80);
            $table->string('scope', 100);
            $table->string('context_key', 160);
            $table->string('slot_hash', 64);
            $table->uuid('transaction_uuid');
            $table->string('status', 20)->default('active');
            $table->unsignedInteger('key_version')->default(1);
            $table->text('encrypted_key')->nullable();
            $table->timestampTz('expires_at')->index();
            $table->timestampsTz();
            $table->unique(['user_id', 'slot_hash', 'transaction_uuid'], 'form_draft_key_identity_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('form_draft_recovery_keys');
        Schema::dropIfExists('form_drafts');
    }
};
