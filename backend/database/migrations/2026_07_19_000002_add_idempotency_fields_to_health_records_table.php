<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('health_records', function (Blueprint $table) {
            $table->uuid('idempotency_key')->nullable()->after('id');
            $table->string('idempotency_hash', 64)->nullable()->after('idempotency_key');
            $table->unique('idempotency_key', 'health_records_idempotency_key_unique');
        });
    }

    public function down(): void
    {
        Schema::table('health_records', function (Blueprint $table) {
            $table->dropUnique('health_records_idempotency_key_unique');
            $table->dropColumn(['idempotency_key', 'idempotency_hash']);
        });
    }
};
