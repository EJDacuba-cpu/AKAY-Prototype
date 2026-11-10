<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tb_treatment_cases', function (Blueprint $table) {
            $table->uuid('registration_key')->nullable()->unique();
            $table->string('registration_hash', 64)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('tb_treatment_cases', function (Blueprint $table) {
            $table->dropUnique(['registration_key']);
            $table->dropColumn(['registration_key', 'registration_hash']);
        });
    }
};
