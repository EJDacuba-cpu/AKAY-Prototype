<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('referrals', function (Blueprint $table): void {
            $table->string('qr_token_hash', 64)->nullable()->unique()->after('qr_code_value');
            $table->text('qr_token_encrypted')->nullable()->after('qr_token_hash');
            $table->timestamp('qr_token_issued_at')->nullable()->after('qr_token_encrypted');
            $table->timestamp('qr_token_last_used_at')->nullable()->after('qr_token_issued_at');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement(
                'REVOKE EXECUTE ON FUNCTION akay_referral_lookup(text, text, bigint, bigint) FROM PUBLIC'
            );
            DB::unprepared(<<<'SQL'
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                        REVOKE EXECUTE ON FUNCTION akay_referral_lookup(text, text, bigint, bigint) FROM anon;
                    END IF;
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                        REVOKE EXECUTE ON FUNCTION akay_referral_lookup(text, text, bigint, bigint) FROM authenticated;
                    END IF;
                END
                $$
            SQL);
        }
    }

    /**
     * The EXECUTE revocation in up() is intentionally not reversed.
     *
     * Re-granting EXECUTE to the browser-facing grantees here would mean that
     * rolling back this migration - for a reason as unrelated as dropping the
     * QR token columns - silently re-opens referral lookup, and therefore full
     * patient and health-record JSON, to anon and authenticated. Privilege
     * rollback is a manual, reviewed step; see
     * docs/database-exposure-containment.md.
     */
    public function down(): void
    {
        Schema::table('referrals', function (Blueprint $table): void {
            $table->dropUnique(['qr_token_hash']);
            $table->dropColumn([
                'qr_token_hash',
                'qr_token_encrypted',
                'qr_token_issued_at',
                'qr_token_last_used_at',
            ]);
        });
    }
};
