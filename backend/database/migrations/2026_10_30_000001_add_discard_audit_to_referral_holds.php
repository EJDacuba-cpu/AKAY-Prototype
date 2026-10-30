<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('referral_holds', function (Blueprint $table) {
            $table->text('discard_reason')->nullable()->after('status');
            $table->foreignId('discarded_by')->nullable()->after('discard_reason')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('referral_holds', function (Blueprint $table) {
            $table->dropConstrainedForeignId('discarded_by');
            $table->dropColumn('discard_reason');
        });
    }
};
