<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('medicines', function (Blueprint $table) {
            $table->unsignedInteger('low_stock_threshold')->default(10)->after('quantity');
            $table
                ->foreignId('barangay_health_center_id')
                ->nullable()
                ->after('rural_health_unit_id')
                ->constrained()
                ->nullOnDelete();
        });

        DB::statement(<<<'SQL'
            UPDATE medicines
            SET barangay_health_center_id = (
                SELECT users.barangay_health_center_id
                FROM users
                WHERE users.id = medicines.created_by
            )
            WHERE medicines.rural_health_unit_id IS NULL
                AND EXISTS (
                    SELECT 1
                    FROM users
                    WHERE users.id = medicines.created_by
                        AND users.barangay_health_center_id IS NOT NULL
                )
        SQL);
    }

    public function down(): void
    {
        Schema::table('medicines', function (Blueprint $table) {
            $table->dropForeign(['barangay_health_center_id']);
            $table->dropColumn('barangay_health_center_id');
            $table->dropColumn('low_stock_threshold');
        });
    }
};
