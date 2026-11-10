<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('medicine_expiry_groups', 'manufacturer_lot_number')) {
            Schema::table('medicine_expiry_groups', function (Blueprint $table): void {
                $table->string('manufacturer_lot_number')->nullable()->after('expiry_not_applicable');
            });
        }
        if (! Schema::hasColumn('medicine_expiry_groups', 'is_legacy_batch')) {
            Schema::table('medicine_expiry_groups', function (Blueprint $table): void {
                $table->boolean('is_legacy_batch')->default(false)->after('manufacturer_lot_number');
            });
        }

        try {
            Schema::table('medicine_expiry_groups', function (Blueprint $table): void {
                $table->dropUnique('medicine_expiry_group_date_unique');
            });
        } catch (Throwable) {
            // Already removed on fresh installs that never created the merge unique.
        }

        DB::statement('DROP INDEX IF EXISTS medicine_expiry_group_date_unique');
        DB::statement('DROP INDEX IF EXISTS medicine_expiry_group_na_unique');

        // Existing rows are merged legacy expiry groups with unknown manufacturer lots.
        DB::table('medicine_expiry_groups')->update([
            'is_legacy_batch' => true,
            'manufacturer_lot_number' => null,
        ]);

        if (DB::getDriverName() === 'pgsql') {
            DB::unprepared(file_get_contents(database_path('sql/medicine_expiry_group_constraints.sql')));
            DB::unprepared(file_get_contents(database_path('sql/medicine_expiry_group_operations.sql')));
        }
    }

    public function down(): void
    {
        throw new RuntimeException('Stock batch tracking cannot be rolled back without risking merged inventory identity; rollback is refused.');
    }
};
