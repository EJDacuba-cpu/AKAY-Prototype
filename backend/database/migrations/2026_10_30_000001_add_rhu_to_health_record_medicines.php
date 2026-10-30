<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('health_record_medicines', function (Blueprint $table): void {
            $table->foreignId('rural_health_unit_id')->nullable()->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('health_record_medicines', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('rural_health_unit_id');
        });
    }
};
