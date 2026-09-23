<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // Existing BHC.rural_health_unit_id remains the default. Historical referrals are untouched.
        Schema::create('bhc_referral_destinations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('barangay_health_center_id')->constrained();
            $table->foreignId('rural_health_unit_id')->constrained();
            $table->unique(['barangay_health_center_id', 'rural_health_unit_id'], 'bhc_destination_unique');
        });
        Schema::table('facility_assignments', function (Blueprint $table) {
            $table->string('assignment_type')->default('ongoing');
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users');
            $table->foreignId('revoked_by')->nullable()->constrained('users');
        });
        DB::table('facility_assignments')->whereNotNull('ends_on')->update(['assignment_type' => 'temporary']);
        // Earlier assignments are retained for review, but never silently authorized under new eligibility rules.
        DB::table('facility_assignments')->whereNull('starts_on')->update(['revoked_at' => now()]);
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE public.bhc_referral_destinations ENABLE ROW LEVEL SECURITY');
            DB::unprepared($this->inventoryFacilityFunction(true));
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::unprepared($this->inventoryFacilityFunction(false));
        }
        Schema::dropIfExists('bhc_referral_destinations');
        Schema::table('facility_assignments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by');
            $table->dropConstrainedForeignId('revoked_by');
            $table->dropColumn(['assignment_type', 'revoked_at']);
        });
    }

    private function inventoryFacilityFunction(bool $includeAssignments): string
    {
        $additionalAccess = $includeAssignments ? <<<'SQL'
        OR EXISTS (
            SELECT 1 FROM public.users u
            JOIN public.rural_health_units home ON home.id = u.rural_health_unit_id AND home.status = 'active'
            JOIN public.facility_assignments a ON a.user_id = u.id
            JOIN public.barangay_health_centers bhc ON bhc.id = a.barangay_health_center_id AND bhc.status = 'active'
            WHERE u.id = p_actor_user_id AND u.status = 'active' AND u.role = 'rhu_staff'
              AND lower(trim(u.professional_designation)) = 'nurse' AND u.barangay_health_center_id IS NULL
              AND bhc.id = p_facility_id AND a.rural_health_unit_id IS NULL
              AND a.revoked_at IS NULL AND a.starts_on <= CURRENT_DATE
              AND (a.ends_on IS NULL OR a.ends_on >= CURRENT_DATE)
              AND a.permissions::jsonb @> '["items.dispense"]'::jsonb
        )
SQL : '';
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
        {$additionalAccess}
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
