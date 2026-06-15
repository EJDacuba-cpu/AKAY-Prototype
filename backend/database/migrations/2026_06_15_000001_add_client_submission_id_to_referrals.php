<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('referrals', 'client_submission_id')) {
            Schema::table('referrals', function (Blueprint $table) {
                $table->string('client_submission_id')->nullable();
            });
        }

        DB::statement(
            'CREATE UNIQUE INDEX IF NOT EXISTS referrals_client_submission_id_unique ON referrals (client_submission_id) WHERE client_submission_id IS NOT NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS referrals_client_submission_id_unique');

        if (Schema::hasColumn('referrals', 'client_submission_id')) {
            Schema::table('referrals', function (Blueprint $table) {
                $table->dropColumn('client_submission_id');
            });
        }
    }
};
