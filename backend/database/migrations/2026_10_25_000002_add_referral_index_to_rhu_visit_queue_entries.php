<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Visits are looked up by referral on arrival and before a referral delete.
 * PostgreSQL does not index foreign keys on its own.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rhu_visit_queue_entries', function (Blueprint $table) {
            $table->index('referral_id', 'rhu_visit_queue_entries_referral_idx');
        });
    }

    public function down(): void
    {
        Schema::table('rhu_visit_queue_entries', function (Blueprint $table) {
            $table->dropIndex('rhu_visit_queue_entries_referral_idx');
        });
    }
};
