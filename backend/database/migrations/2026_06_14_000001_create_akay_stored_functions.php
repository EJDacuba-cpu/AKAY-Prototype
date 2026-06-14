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
CREATE OR REPLACE FUNCTION akay_patient_json(p patients)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'middle_name', p.middle_name,
        'last_name', p.last_name,
        'full_name', trim(concat_ws(' ', p.first_name, p.middle_name, p.last_name)),
        'sex', p.sex,
        'birthdate', p.birthdate,
        'age', CASE WHEN p.birthdate IS NULL THEN NULL ELSE date_part('year', age(p.birthdate))::int END,
        'contact_number', p.contact_number,
        'street_address', p.street_address,
        'barangay', p.barangay,
        'municipality', p.municipality,
        'civil_status', p.civil_status,
        'philhealth_number', p.philhealth_number,
        'philhealth_category', p.philhealth_category,
        'patient_category', p.patient_category,
        'status', p.status,
        'created_by', p.created_by,
        'barangay_health_center_id', p.barangay_health_center_id,
        'rural_health_unit_id', p.rural_health_unit_id,
        'created_at', p.created_at,
        'updated_at', p.updated_at,
        'barangay_health_center', CASE WHEN bhc.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', bhc.id,
            'name', bhc.name,
            'barangay', bhc.barangay,
            'address', bhc.address,
            'contact_information', bhc.contact_information,
            'status', bhc.status
        ) END,
        'rural_health_unit', CASE WHEN rhu.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', rhu.id,
            'name', rhu.name,
            'address', rhu.address,
            'contact_information', rhu.contact_information,
            'status', rhu.status
        ) END
    )
    FROM patients patient_row
    LEFT JOIN barangay_health_centers bhc ON bhc.id = p.barangay_health_center_id
    LEFT JOIN rural_health_units rhu ON rhu.id = p.rural_health_unit_id
    WHERE patient_row.id = p.id
$$;

CREATE OR REPLACE FUNCTION akay_health_record_json(hr health_records)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'id', hr.id,
        'patient_id', hr.patient_id,
        'created_by', hr.created_by,
        'barangay_health_center_id', hr.barangay_health_center_id,
        'rural_health_unit_id', hr.rural_health_unit_id,
        'date_recorded', hr.date_recorded,
        'vital_signs', hr.vital_signs,
        'category', hr.category,
        'maternal_data', hr.maternal_data,
        'immunization_data', hr.immunization_data,
        'monitoring_data', hr.monitoring_data,
        'needs_referral', hr.needs_referral,
        'chief_complaint', hr.chief_complaint,
        'diagnosis', hr.diagnosis,
        'treatment_notes', hr.treatment_notes,
        'medical_history', hr.medical_history,
        'notes', hr.notes,
        'created_at', hr.created_at,
        'updated_at', hr.updated_at,
        'patient', akay_patient_json(p)
    )
    FROM patients p
    WHERE p.id = hr.patient_id
$$;

CREATE OR REPLACE FUNCTION akay_referral_json(r referrals, p_include_updates boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'id', r.id,
        'tracking_id', r.tracking_id,
        'qr_code_value', r.qr_code_value,
        'patient_id', r.patient_id,
        'health_record_id', r.health_record_id,
        'barangay_health_center_id', r.barangay_health_center_id,
        'rural_health_unit_id', r.rural_health_unit_id,
        'created_by', r.created_by,
        'referral_category', r.referral_category,
        'urgency_level', r.urgency_level,
        'reason_for_referral', r.reason_for_referral,
        'chief_complaint', r.chief_complaint,
        'initial_diagnosis', r.initial_diagnosis,
        'initial_action_taken', r.initial_action_taken,
        'referring_practitioner', r.referring_practitioner,
        'referral_datetime', r.referral_datetime,
        'status', r.status,
        'remarks', r.remarks,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'patient', akay_patient_json(p),
        'health_record', CASE WHEN hr.id IS NULL THEN NULL ELSE akay_health_record_json(hr) END,
        'barangay_health_center', CASE WHEN bhc.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', bhc.id,
            'name', bhc.name,
            'barangay', bhc.barangay,
            'address', bhc.address,
            'contact_information', bhc.contact_information,
            'status', bhc.status
        ) END,
        'rural_health_unit', CASE WHEN rhu.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', rhu.id,
            'name', rhu.name,
            'address', rhu.address,
            'contact_information', rhu.contact_information,
            'status', rhu.status
        ) END,
        'feedback', CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', f.id,
            'referral_id', f.referral_id,
            'received_at', f.received_at,
            'rhu_diagnosis', f.rhu_diagnosis,
            'action_taken', f.action_taken,
            'treatment_notes', f.treatment_notes,
            'recommendation', f.recommendation,
            'receiving_practitioner', f.receiving_practitioner,
            'remarks', f.remarks,
            'created_by', f.created_by,
            'created_at', f.created_at,
            'updated_at', f.updated_at
        ) END,
        'updates', CASE WHEN p_include_updates THEN COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', ru.id,
                'referral_id', ru.referral_id,
                'user_id', ru.user_id,
                'previous_status', ru.previous_status,
                'status', ru.status,
                'remarks', ru.remarks,
                'created_at', ru.created_at,
                'updated_at', ru.updated_at,
                'user', CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
                    'id', u.id,
                    'name', u.name,
                    'email', u.email,
                    'role', u.role,
                    'status', u.status
                ) END
            ) ORDER BY ru.created_at ASC, ru.id ASC)
            FROM referral_updates ru
            LEFT JOIN users u ON u.id = ru.user_id
            WHERE ru.referral_id = r.id
        ), '[]'::jsonb) ELSE NULL END
    )
    FROM patients p
    LEFT JOIN health_records hr ON hr.id = r.health_record_id
    LEFT JOIN barangay_health_centers bhc ON bhc.id = r.barangay_health_center_id
    LEFT JOIN rural_health_units rhu ON rhu.id = r.rural_health_unit_id
    LEFT JOIN feedback f ON f.referral_id = r.id
    WHERE p.id = r.patient_id
$$;

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

CREATE OR REPLACE FUNCTION akay_patient_details(
    p_patient_id bigint,
    p_role text,
    p_bhc_id bigint,
    p_rhu_id bigint
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT akay_patient_json(p)
        || jsonb_build_object(
            'health_records_count', (SELECT count(*) FROM health_records hr WHERE hr.patient_id = p.id),
            'referrals_count', (SELECT count(*) FROM referrals r WHERE r.patient_id = p.id),
            'health_records', COALESCE((
                SELECT jsonb_agg(akay_health_record_json(hr) ORDER BY hr.date_recorded DESC NULLS LAST, hr.id DESC)
                FROM health_records hr
                WHERE hr.patient_id = p.id
            ), '[]'::jsonb),
            'referrals', COALESCE((
                SELECT jsonb_agg(akay_referral_json(r, false) ORDER BY r.created_at DESC NULLS LAST, r.id DESC)
                FROM referrals r
                WHERE r.patient_id = p.id
            ), '[]'::jsonb)
        )
    FROM patients p
    WHERE p.id = p_patient_id
    AND (
        p_role = 'admin'
        OR (p_role = 'bhw' AND p.barangay_health_center_id = p_bhc_id)
        OR (p_role = 'rhu_staff' AND p.rural_health_unit_id = p_rhu_id)
    )
$$;

CREATE OR REPLACE FUNCTION akay_health_record_list(
    p_role text,
    p_bhc_id bigint,
    p_rhu_id bigint,
    p_patient_id bigint DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_limit int DEFAULT 25,
    p_offset int DEFAULT 0
)
RETURNS TABLE(total_count bigint, item jsonb)
LANGUAGE sql
STABLE
AS $$
    WITH scoped AS (
        SELECT hr.*
        FROM health_records hr
        WHERE (
            p_role = 'admin'
            OR (p_role = 'bhw' AND hr.barangay_health_center_id = p_bhc_id)
            OR (p_role = 'rhu_staff' AND hr.rural_health_unit_id = p_rhu_id)
        )
        AND (p_patient_id IS NULL OR hr.patient_id = p_patient_id)
        AND (p_category IS NULL OR p_category = '' OR hr.category = p_category)
    ),
    counted AS (SELECT count(*) AS total FROM scoped)
    SELECT counted.total, akay_health_record_json(scoped)
    FROM scoped, counted
    ORDER BY scoped.date_recorded DESC NULLS LAST, scoped.id DESC
    LIMIT p_limit OFFSET p_offset
$$;

CREATE OR REPLACE FUNCTION akay_health_record_details(
    p_record_id bigint,
    p_role text,
    p_bhc_id bigint,
    p_rhu_id bigint
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT akay_health_record_json(hr)
        || jsonb_build_object(
            'referrals', COALESCE((
                SELECT jsonb_agg(akay_referral_json(r, false) ORDER BY r.created_at DESC NULLS LAST, r.id DESC)
                FROM referrals r
                WHERE r.health_record_id = hr.id
            ), '[]'::jsonb)
        )
    FROM health_records hr
    WHERE hr.id = p_record_id
    AND (
        p_role = 'admin'
        OR (p_role = 'bhw' AND hr.barangay_health_center_id = p_bhc_id)
        OR (p_role = 'rhu_staff' AND hr.rural_health_unit_id = p_rhu_id)
    )
$$;

CREATE OR REPLACE FUNCTION akay_referral_list(
    p_role text,
    p_bhc_id bigint,
    p_rhu_id bigint,
    p_status text DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_urgency text DEFAULT NULL,
    p_bhc_filter bigint DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_limit int DEFAULT 25,
    p_offset int DEFAULT 0
)
RETURNS TABLE(total_count bigint, item jsonb)
LANGUAGE sql
STABLE
AS $$
    WITH scoped AS (
        SELECT r.*
        FROM referrals r
        JOIN patients p ON p.id = r.patient_id
        WHERE (
            p_role = 'admin'
            OR (p_role = 'bhw' AND r.barangay_health_center_id = p_bhc_id)
            OR (p_role = 'rhu_staff' AND r.rural_health_unit_id = p_rhu_id)
        )
        AND (p_status IS NULL OR p_status = '' OR r.status = p_status)
        AND (p_category IS NULL OR p_category = '' OR r.referral_category = p_category)
        AND (p_urgency IS NULL OR p_urgency = '' OR r.urgency_level = p_urgency)
        AND (p_bhc_filter IS NULL OR r.barangay_health_center_id = p_bhc_filter)
        AND (p_search IS NULL OR p_search = '' OR
            r.tracking_id ILIKE '%' || p_search || '%' OR
            p.first_name ILIKE '%' || p_search || '%' OR
            p.last_name ILIKE '%' || p_search || '%')
    ),
    counted AS (SELECT count(*) AS total FROM scoped)
    SELECT counted.total, akay_referral_json(scoped, false)
    FROM scoped, counted
    ORDER BY scoped.created_at DESC NULLS LAST, scoped.id DESC
    LIMIT p_limit OFFSET p_offset
$$;

CREATE OR REPLACE FUNCTION akay_incoming_referrals(
    p_rhu_id bigint,
    p_status text DEFAULT NULL,
    p_limit int DEFAULT 25,
    p_offset int DEFAULT 0
)
RETURNS TABLE(total_count bigint, item jsonb)
LANGUAGE sql
STABLE
AS $$
    SELECT *
    FROM akay_referral_list(
        'rhu_staff',
        NULL,
        p_rhu_id,
        p_status,
        NULL,
        NULL,
        NULL,
        NULL,
        p_limit,
        p_offset
    )
$$;

CREATE OR REPLACE FUNCTION akay_referral_details(
    p_referral_id bigint,
    p_role text,
    p_bhc_id bigint,
    p_rhu_id bigint
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT akay_referral_json(r, true)
    FROM referrals r
    WHERE r.id = p_referral_id
    AND (
        p_role = 'admin'
        OR (p_role = 'bhw' AND r.barangay_health_center_id = p_bhc_id)
        OR (p_role = 'rhu_staff' AND r.rural_health_unit_id = p_rhu_id)
    )
$$;

CREATE OR REPLACE FUNCTION akay_referral_lookup(
    p_value text,
    p_role text,
    p_bhc_id bigint,
    p_rhu_id bigint
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT akay_referral_json(r, true)
    FROM referrals r
    WHERE (r.tracking_id = p_value OR r.qr_code_value = p_value)
    AND (
        p_role = 'admin'
        OR (p_role = 'bhw' AND r.barangay_health_center_id = p_bhc_id)
        OR (p_role = 'rhu_staff' AND r.rural_health_unit_id = p_rhu_id)
    )
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION akay_dashboard_summary_counts(
    p_role text,
    p_bhc_id bigint,
    p_rhu_id bigint
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'patients_total', (
            SELECT count(*) FROM patients p
            WHERE p_role = 'admin'
                OR (p_role = 'bhw' AND p.barangay_health_center_id = p_bhc_id)
                OR (p_role = 'rhu_staff' AND p.rural_health_unit_id = p_rhu_id)
        ),
        'health_records_total', (
            SELECT count(*) FROM health_records hr
            WHERE p_role = 'admin'
                OR (p_role = 'bhw' AND hr.barangay_health_center_id = p_bhc_id)
                OR (p_role = 'rhu_staff' AND hr.rural_health_unit_id = p_rhu_id)
        ),
        'referrals_total', (
            SELECT count(*) FROM referrals r
            WHERE p_role = 'admin'
                OR (p_role = 'bhw' AND r.barangay_health_center_id = p_bhc_id)
                OR (p_role = 'rhu_staff' AND r.rural_health_unit_id = p_rhu_id)
        ),
        'pending_referrals', (
            SELECT count(*) FROM referrals r
            WHERE r.status = 'Pending'
            AND (
                p_role = 'admin'
                OR (p_role = 'bhw' AND r.barangay_health_center_id = p_bhc_id)
                OR (p_role = 'rhu_staff' AND r.rural_health_unit_id = p_rhu_id)
            )
        ),
        'monitoring_referrals', (
            SELECT count(*) FROM referrals r
            WHERE r.status = 'For Monitoring'
            AND (
                p_role = 'admin'
                OR (p_role = 'bhw' AND r.barangay_health_center_id = p_bhc_id)
                OR (p_role = 'rhu_staff' AND r.rural_health_unit_id = p_rhu_id)
            )
        )
    )
$$;

CREATE OR REPLACE FUNCTION akay_referral_report(
    p_role text,
    p_bhc_id bigint,
    p_rhu_id bigint
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    WITH scoped AS (
        SELECT r.*, bhc.barangay
        FROM referrals r
        LEFT JOIN barangay_health_centers bhc ON bhc.id = r.barangay_health_center_id
        WHERE p_role = 'admin'
            OR (p_role = 'bhw' AND r.barangay_health_center_id = p_bhc_id)
            OR (p_role = 'rhu_staff' AND r.rural_health_unit_id = p_rhu_id)
    )
    SELECT jsonb_build_object(
        'total_referrals', (SELECT count(*) FROM scoped),
        'completed_referrals', (SELECT count(*) FROM scoped WHERE status = 'Completed'),
        'no_show_referrals', (SELECT count(*) FROM scoped WHERE status = 'No-Show'),
        'referrals_by_status', COALESCE((SELECT jsonb_object_agg(status, total) FROM (
            SELECT status, count(*) AS total FROM scoped GROUP BY status
        ) s), '{}'::jsonb),
        'referrals_by_category', COALESCE((SELECT jsonb_object_agg(COALESCE(referral_category, 'Uncategorized'), total) FROM (
            SELECT referral_category, count(*) AS total FROM scoped GROUP BY referral_category
        ) c), '{}'::jsonb),
        'referrals_by_barangay', COALESCE((SELECT jsonb_object_agg(COALESCE(barangay, 'Unassigned'), total) FROM (
            SELECT barangay, count(*) AS total FROM scoped GROUP BY barangay
        ) b), '{}'::jsonb),
        'weekly_referrals', (SELECT count(*) FROM scoped WHERE created_at >= now() - interval '7 days'),
        'monthly_referrals', (SELECT count(*) FROM scoped WHERE created_at >= now() - interval '1 month')
    )
$$;
SQL);
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
DROP FUNCTION IF EXISTS akay_referral_report(text, bigint, bigint);
DROP FUNCTION IF EXISTS akay_dashboard_summary_counts(text, bigint, bigint);
DROP FUNCTION IF EXISTS akay_referral_lookup(text, text, bigint, bigint);
DROP FUNCTION IF EXISTS akay_referral_details(bigint, text, bigint, bigint);
DROP FUNCTION IF EXISTS akay_incoming_referrals(bigint, text, int, int);
DROP FUNCTION IF EXISTS akay_referral_list(text, bigint, bigint, text, text, text, bigint, text, int, int);
DROP FUNCTION IF EXISTS akay_health_record_details(bigint, text, bigint, bigint);
DROP FUNCTION IF EXISTS akay_health_record_list(text, bigint, bigint, bigint, text, int, int);
DROP FUNCTION IF EXISTS akay_patient_details(bigint, text, bigint, bigint);
DROP FUNCTION IF EXISTS akay_patient_list(text, bigint, bigint, text, text, text, text, int, int);
DROP FUNCTION IF EXISTS akay_referral_json(referrals, boolean);
DROP FUNCTION IF EXISTS akay_health_record_json(health_records);
DROP FUNCTION IF EXISTS akay_patient_json(patients);
SQL);
    }
};
