<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Frozen ITR history for one visit: section slices as documented at finalize,
 * plus the same deltas stored on background_changes. Later Patient Background
 * updates must not rewrite this column. Legacy rows stay null.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('health_records', function (Blueprint $table) {
            if (! Schema::hasColumn('health_records', 'history_snapshot')) {
                $table->json('history_snapshot')->nullable()->after('similar_illness');
            }
        });
    }

    public function down(): void
    {
        Schema::table('health_records', function (Blueprint $table) {
            if (Schema::hasColumn('health_records', 'history_snapshot')) {
                $table->dropColumn('history_snapshot');
            }
        });
    }
};
