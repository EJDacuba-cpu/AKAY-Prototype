<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION akay_patient_list(
    p_role text,
    p_bhc_id bigint,
    p_rhu_id bigint,
    p_search text DEFAULT NULL,
    p_patient_category text DEFAULT NULL,
    p_barangay text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_limit int DEFAULT 25,
    p_offset int DEFAULT 0
)
RETURNS TABLE(total_count bigint, item jsonb)
LANGUAGE sql
STABLE
AS $$
    WITH scoped AS (
        SELECT p.*
        FROM patients p
        WHERE (
            p_role = 'admin'
            OR (p_role = 'bhw' AND p.barangay_health_center_id = p_bhc_id)
            OR (p_role = 'rhu_staff' AND p.rural_health_unit_id = p_rhu_id)
        )
        AND (p_search IS NULL OR p_search = '' OR
            p.id::text ILIKE '%' || p_search || '%' OR
            p.first_name ILIKE '%' || p_search || '%' OR
            p.middle_name ILIKE '%' || p_search || '%' OR
            p.last_name ILIKE '%' || p_search || '%' OR
            p.philhealth_number ILIKE '%' || p_search || '%' OR
            p.contact_number ILIKE '%' || p_search || '%' OR
            p.barangay ILIKE '%' || p_search || '%')
        AND (p_patient_category IS NULL OR p_patient_category = '' OR p.patient_category = p_patient_category)
        AND (p_barangay IS NULL OR p_barangay = '' OR p.barangay = p_barangay)
        AND (p_status IS NULL OR p_status = '' OR p.status = p_status)
    ),
    counted AS (SELECT count(*) AS total FROM scoped)
    SELECT counted.total, akay_patient_json(scoped)
    FROM scoped, counted
    ORDER BY scoped.created_at DESC NULLS LAST, scoped.id DESC
    LIMIT p_limit OFFSET p_offset
$$;
SQL);
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION akay_patient_list(
    p_role text,
    p_bhc_id bigint,
    p_rhu_id bigint,
    p_search text DEFAULT NULL,
    p_patient_category text DEFAULT NULL,
    p_barangay text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_limit int DEFAULT 25,
    p_offset int DEFAULT 0
)
RETURNS TABLE(total_count bigint, item jsonb)
LANGUAGE sql
STABLE
AS $$
    WITH scoped AS (
        SELECT p.*
        FROM patients p
        WHERE (
            p_role = 'admin'
            OR (p_role = 'bhw' AND p.barangay_health_center_id = p_bhc_id)
            OR (p_role = 'rhu_staff' AND p.rural_health_unit_id = p_rhu_id)
        )
        AND (p_search IS NULL OR p_search = '' OR
            p.first_name ILIKE '%' || p_search || '%' OR
            p.middle_name ILIKE '%' || p_search || '%' OR
            p.last_name ILIKE '%' || p_search || '%' OR
            p.philhealth_number ILIKE '%' || p_search || '%')
        AND (p_patient_category IS NULL OR p_patient_category = '' OR p.patient_category = p_patient_category)
        AND (p_barangay IS NULL OR p_barangay = '' OR p.barangay = p_barangay)
        AND (p_status IS NULL OR p_status = '' OR p.status = p_status)
    ),
    counted AS (SELECT count(*) AS total FROM scoped)
    SELECT counted.total, akay_patient_json(scoped)
    FROM scoped, counted
    ORDER BY scoped.created_at DESC NULLS LAST, scoped.id DESC
    LIMIT p_limit OFFSET p_offset
$$;
SQL);
    }
};
