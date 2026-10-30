<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }
        DB::unprepared(file_get_contents(database_path('sql/medicine_expiry_group_operations.sql')));
    }

    public function down(): void
    {
        throw new RuntimeException('RHU dispensing history must be preserved; rollback is refused.');
    }
};
