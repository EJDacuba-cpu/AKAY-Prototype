<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** Adds the RHU Staff preset (intake_staff) to the staff_role check. No account changes. */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }
        DB::statement('ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_staff_role_check');
        DB::statement("ALTER TABLE public.users ADD CONSTRAINT users_staff_role_check CHECK (staff_role IS NULL OR staff_role IN ('midwife','bhw','encoder','nurse','doctor','intake_staff'))");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }
        // Fails while any account still holds intake_staff; reassign those accounts first.
        DB::statement('ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_staff_role_check');
        DB::statement("ALTER TABLE public.users ADD CONSTRAINT users_staff_role_check CHECK (staff_role IS NULL OR staff_role IN ('midwife','bhw','encoder','nurse','doctor'))");
    }
};
