<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') return;
        DB::statement('ALTER TABLE public.medicines DROP CONSTRAINT IF EXISTS medicines_item_type_check');
        DB::statement("ALTER TABLE public.medicines ADD CONSTRAINT medicines_item_type_check CHECK (item_type IN ('medicine','vaccine','health_supply'))");
        DB::unprepared(file_get_contents(database_path('sql/medicine_expiry_group_operations.sql')));
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') return;
        if (DB::table('medicines')->where('item_type', 'vaccine')->exists()) {
            throw new RuntimeException('Vaccine catalog records must be preserved; rollback is refused.');
        }
        DB::statement('ALTER TABLE public.medicines DROP CONSTRAINT medicines_item_type_check');
        DB::statement("ALTER TABLE public.medicines ADD CONSTRAINT medicines_item_type_check CHECK (item_type IN ('medicine','health_supply'))");
        DB::unprepared(file_get_contents(database_path('sql/medicine_expiry_group_operations_before_strict_dispense.sql')));
    }
};
