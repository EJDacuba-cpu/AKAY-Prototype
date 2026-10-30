<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The stable identity of one consultation, from the moment the encoder leaves
 * the setup screen through to the official health record.
 *
 * This is NOT idempotency_key and does not change its behaviour. The two answer
 * different questions and both are kept:
 *
 *   consultation_uuid - which consultation is this? Generated once by the
 *                       client at consultation start, carried by the server
 *                       draft, by the encrypted on-device draft, and finally by
 *                       this record. Stable across autosave, navigation,
 *                       offline/online transitions, recovery and resume.
 *   idempotency_key   - which SUBMISSION attempt is this? Minted at final save
 *                       and bound to one exact payload via idempotency_hash.
 *
 * Nullable, because every record written before this column existed has no
 * consultation identity and must keep working. Nothing is backfilled here.
 *
 * Unique, so one consultation can become at most one official record. In both
 * PostgreSQL and SQLite a unique index permits many NULLs, so legacy rows are
 * unaffected. This gives a second, semantically correct duplicate-submission
 * guard behind idempotency_key: a reload that mints a fresh idempotency key can
 * still not save the same consultation twice.
 *
 * Deliberately NOT added to akay_health_record_json: the column is hidden on
 * the model, like idempotency_key, so no read path exposes it and the stored
 * function does not need to be re-created.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('health_records', function (Blueprint $table): void {
            $table->uuid('consultation_uuid')->nullable()->after('idempotency_hash');
            $table->unique('consultation_uuid', 'health_records_consultation_uuid_unique');
        });
    }

    public function down(): void
    {
        Schema::table('health_records', function (Blueprint $table): void {
            $table->dropUnique('health_records_consultation_uuid_unique');
            $table->dropColumn('consultation_uuid');
        });
    }
};
