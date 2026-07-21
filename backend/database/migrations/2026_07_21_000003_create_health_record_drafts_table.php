<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('health_record_drafts', function (Blueprint $table): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('owner_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('barangay_health_center_id')
                ->constrained('barangay_health_centers')
                ->cascadeOnDelete();
            $table->foreignId('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->string('classification', 100);
            $table->text('encrypted_payload')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->string('status', 20)->default('active');
            $table->foreignId('consumed_health_record_id')
                ->nullable()
                ->constrained('health_records')
                ->nullOnDelete();
            $table->timestamp('expires_at')->index();
            $table->timestamp('last_saved_at');
            $table->timestamps();

            $table->index(
                ['owner_user_id', 'status', 'last_saved_at'],
                'health_record_drafts_owner_status_saved_index'
            );
            $table->index(
                ['barangay_health_center_id', 'status'],
                'health_record_drafts_bhc_status_index'
            );
            $table->index(
                ['patient_id', 'status'],
                'health_record_drafts_patient_status_index'
            );
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement(<<<'SQL'
                ALTER TABLE health_record_drafts
                ADD CONSTRAINT health_record_drafts_status_check
                CHECK (status IN ('active', 'consumed', 'discarded', 'expired'))
            SQL);
            DB::statement(<<<'SQL'
                ALTER TABLE health_record_drafts
                ADD CONSTRAINT health_record_drafts_version_check
                CHECK (version >= 1)
            SQL);
            DB::statement(<<<'SQL'
                ALTER TABLE health_record_drafts
                ADD CONSTRAINT health_record_drafts_payload_lifecycle_check
                CHECK (
                    (
                        status = 'active'
                        AND encrypted_payload IS NOT NULL
                        AND consumed_health_record_id IS NULL
                    )
                    OR
                    (
                        status <> 'active'
                        AND encrypted_payload IS NULL
                        AND (
                            status = 'consumed'
                            OR consumed_health_record_id IS NULL
                        )
                    )
                )
            SQL);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('health_record_drafts');
    }
};
