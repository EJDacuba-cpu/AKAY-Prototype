<?php

use App\Services\StaffRoles;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('staff_role')->nullable();
            $table->string('contact_number', 11)->nullable();
        });
        // Designations without a matching role (Logistics, MHO, Other, blank) stay NULL until an admin picks one.
        DB::table('users')->whereNotNull('professional_designation')->orderBy('id')->each(function ($row): void {
            DB::table('users')->where('id', $row->id)->update(['staff_role' => StaffRoles::fromDesignation($row->professional_designation)]);
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE public.users ADD CONSTRAINT users_staff_role_check CHECK (staff_role IS NULL OR staff_role IN ('midwife','bhw','encoder','nurse','doctor'))");
            DB::unprepared($this->inventoryFacilityFunction("u.staff_role = 'nurse'"));
        }
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('professional_designation'));
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->string('professional_designation')->nullable());
        DB::table('users')->whereNotNull('staff_role')->orderBy('id')->each(function ($row): void {
            DB::table('users')->where('id', $row->id)->update(['professional_designation' => StaffRoles::label($row->staff_role)]);
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::unprepared($this->inventoryFacilityFunction("lower(trim(u.professional_designation)) = 'nurse'"));
            DB::statement('ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_staff_role_check');
        }
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['staff_role', 'contact_number']));
    }

    /** Same function as 2026_09_23_000003 (with assignments); only the nurse predicate differs. */
    private function inventoryFacilityFunction(string $nursePredicate): string
    {
        return <<<SQL
CREATE OR REPLACE FUNCTION public.akay_inventory_actor_has_facility(
    p_actor_user_id bigint,
    p_facility_type text,
    p_facility_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS \$function\$
    SELECT CASE
        WHEN p_facility_type = 'bhc' THEN EXISTS (
            SELECT 1
            FROM public.users AS u
            JOIN public.barangay_health_centers AS bhc
              ON bhc.id = u.barangay_health_center_id
            WHERE u.id = p_actor_user_id
              AND u.role = 'bhw'
              AND u.status = 'active'
              AND u.rural_health_unit_id IS NULL
              AND bhc.id = p_facility_id
              AND bhc.status = 'active'
        )
        OR EXISTS (
            SELECT 1 FROM public.users u
            JOIN public.rural_health_units home ON home.id = u.rural_health_unit_id AND home.status = 'active'
            JOIN public.facility_assignments a ON a.user_id = u.id
            JOIN public.barangay_health_centers bhc ON bhc.id = a.barangay_health_center_id AND bhc.status = 'active'
            WHERE u.id = p_actor_user_id AND u.status = 'active' AND u.role = 'rhu_staff'
              AND {$nursePredicate} AND u.barangay_health_center_id IS NULL
              AND bhc.id = p_facility_id AND a.rural_health_unit_id IS NULL
              AND a.revoked_at IS NULL AND a.starts_on <= CURRENT_DATE
              AND (a.ends_on IS NULL OR a.ends_on >= CURRENT_DATE)
              AND a.permissions::jsonb @> '["items.dispense"]'::jsonb
        )
        WHEN p_facility_type = 'rhu' THEN EXISTS (
            SELECT 1
            FROM public.users AS u
            JOIN public.rural_health_units AS rhu
              ON rhu.id = u.rural_health_unit_id
            WHERE u.id = p_actor_user_id
              AND u.role = 'rhu_staff'
              AND u.status = 'active'
              AND u.barangay_health_center_id IS NULL
              AND rhu.id = p_facility_id
              AND rhu.status = 'active'
        )
        ELSE false
    END
\$function\$;
SQL;
    }
};
