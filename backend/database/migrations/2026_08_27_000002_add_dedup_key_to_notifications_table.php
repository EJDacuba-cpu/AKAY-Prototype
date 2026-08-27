<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Decision B4 (notification-system-remediation-implementation.md) -
 * UserNotificationService::notifyUserOnce() used to check existence then
 * create, which is a TOCTOU race: two concurrent callers (e.g. two BHWs at
 * the same BHC both loading the app) can both pass the exists() check and
 * both insert, producing duplicate notifications.
 *
 * dedup_key is a single column computed from whichever identity a caller
 * provided (entity_type+entity_id, else referral_id, else title+message),
 * written via insertOrIgnore so the database - not a race-prone read then
 * write - is what enforces uniqueness.
 *
 * Plain unique(), not a partial index: PostgreSQL treats every NULL in a
 * unique column as distinct from every other NULL, so rows written through
 * notifyUser() (the always-insert variant, which has no dedup identity and
 * leaves this column null) never collide with each other or with anything
 * else.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->string('dedup_key')->nullable()->unique()->after('entity_id');
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropUnique(['dedup_key']);
            $table->dropColumn('dedup_key');
        });
    }
};
