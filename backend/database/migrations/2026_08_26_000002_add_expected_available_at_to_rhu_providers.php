<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * DOC-22-adjacent: an RHU-supplied, human-readable estimate of when an
 * Unavailable provider expects to be back (e.g. "In a meeting until 2pm" as a
 * timestamp instead of only free text in `remarks`).
 *
 * DISPLAY ONLY. Nothing reads this column to trigger a notification, change
 * availability_status, or feed the DOC-14 gate - doing so would repeat
 * exactly the drift DOC-19 warns against, since real schedules "change from
 * time to time" (confirmed in interview). The notification in this feature
 * fires off the ACTUAL availability_status transition
 * (RhuProviderController::update), never off this column.
 *
 * Consistent with DOC-15a-V: this is RHU-written informational data, not a
 * column that designates or automates a replacement provider.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rhu_providers', function (Blueprint $table) {
            $table->timestamp('expected_available_at')->nullable()->after('remarks');
        });
    }

    public function down(): void
    {
        Schema::table('rhu_providers', function (Blueprint $table) {
            $table->dropColumn('expected_available_at');
        });
    }
};
