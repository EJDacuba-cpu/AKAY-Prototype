<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('barangay_health_centers', function (Blueprint $table) {
            $table->foreignId('rural_health_unit_id')
                ->nullable()
                ->after('id')
                ->constrained('rural_health_units')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('barangay_health_centers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('rural_health_unit_id');
        });
    }
};
