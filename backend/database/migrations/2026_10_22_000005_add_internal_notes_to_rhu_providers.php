<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * RHU-only coordination notes on the official doctor roster.
 *
 * Shared referral notes stay in remarks and remain visible to BHC.
 * internal_notes must never appear on BHC availability payloads.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rhu_providers', function (Blueprint $table) {
            $table->text('internal_notes')->nullable()->after('remarks');
        });
    }

    public function down(): void
    {
        Schema::table('rhu_providers', function (Blueprint $table) {
            $table->dropColumn('internal_notes');
        });
    }
};
