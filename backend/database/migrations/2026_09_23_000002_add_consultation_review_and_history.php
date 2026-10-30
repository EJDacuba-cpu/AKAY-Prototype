<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('health_record_drafts', function (Blueprint $table): void {
            $table->string('review_state')->default('encoding');
            $table->foreignId('editor_user_id')->nullable()->constrained('users');
            $table->timestamp('editor_expires_at')->nullable();
            $table->foreignId('last_editor_user_id')->nullable()->constrained('users');
            $table->text('return_note')->nullable();
        });
        Schema::create('consultation_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('health_record_draft_id')->constrained();
            $table->foreignId('actor_id')->constrained('users');
            $table->string('action');
            $table->unsignedInteger('version');
            $table->text('note')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE public.consultation_events ENABLE ROW LEVEL SECURITY');
        }
        Schema::table('health_records', function (Blueprint $table): void {
            $table->foreignId('encoded_by')->nullable()->constrained('users');
            $table->foreignId('assessed_by')->nullable()->constrained('users');
            $table->foreignId('finalized_by')->nullable()->constrained('users');
            $table->timestamp('finalized_at')->nullable();
            $table->json('items_planned')->nullable();
        });
        Schema::create('health_record_corrections', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('health_record_id')->constrained();
            $table->foreignId('author_id')->constrained('users');
            $table->text('original_entry');
            $table->text('addendum');
            $table->text('reason');
            $table->timestamp('created_at')->useCurrent();
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE public.health_record_corrections ENABLE ROW LEVEL SECURITY');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('health_record_corrections');
        Schema::table('health_records', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('encoded_by');
            $table->dropConstrainedForeignId('assessed_by');
            $table->dropConstrainedForeignId('finalized_by');
            $table->dropColumn(['finalized_at', 'items_planned']);
        });
        Schema::dropIfExists('consultation_events');
        Schema::table('health_record_drafts', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('editor_user_id');
            $table->dropConstrainedForeignId('last_editor_user_id');
            $table->dropColumn(['review_state', 'editor_expires_at', 'return_note']);
        });
    }
};
