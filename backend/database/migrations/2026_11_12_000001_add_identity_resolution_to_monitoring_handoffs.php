<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Records how RHU→BHC monitoring handoffs resolved patient identity.
 * Additive only — historical redirected rows and statuses stay intact.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monitoring_handoff_requests', function (Blueprint $table) {
            $table->string('identity_source', 40)->nullable()->after('status');
            $table->string('identity_resolution', 40)->nullable()->after('identity_source');
            $table->string('identity_resolution_note', 500)->nullable()->after('identity_resolution');
        });
    }

    public function down(): void
    {
        Schema::table('monitoring_handoff_requests', function (Blueprint $table) {
            $table->dropColumn(['identity_source', 'identity_resolution', 'identity_resolution_note']);
        });
    }
};
