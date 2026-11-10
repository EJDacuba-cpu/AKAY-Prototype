<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('health_records', fn (Blueprint $table) => $table->json('tb_assessment_authority')->nullable());
    }

    public function down(): void
    {
        Schema::table('health_records', fn (Blueprint $table) => $table->dropColumn('tb_assessment_authority'));
    }
};
