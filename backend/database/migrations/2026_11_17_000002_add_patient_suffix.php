<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patients', fn (Blueprint $table) => $table->string('suffix', 50)->nullable());
    }

    public function down(): void
    {
        if (DB::table('patients')->whereNotNull('suffix')->exists()) {
            throw new RuntimeException('Patient suffix data must be preserved; rollback is refused.');
        }
        Schema::table('patients', fn (Blueprint $table) => $table->dropColumn('suffix'));
    }
};
