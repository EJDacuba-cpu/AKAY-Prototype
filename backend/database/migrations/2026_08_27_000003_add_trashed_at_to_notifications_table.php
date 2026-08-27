<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Decision D-5 (notification-system-remediation-implementation.md) - Trash
 * previously existed only as a client-side React state map
 * (notificationTrashMap in useNotificationsContext.jsx), with no API call
 * and no persistent store. It was lost on every page reload.
 *
 * trashed_at is independent of cleared_at: "cleared" (Clear All) and
 * "trashed" (moved to Trash, individually recoverable) are two distinct
 * user actions with two distinct recovery stories, so they get two distinct
 * columns rather than overloading one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->timestamp('trashed_at')->nullable()->after('cleared_at')->index();
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropColumn('trashed_at');
        });
    }
};
