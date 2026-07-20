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

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement(
                'GRANT EXECUTE ON FUNCTION akay_referral_lookup(text, text, bigint, bigint) TO PUBLIC'
            );
        }

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
