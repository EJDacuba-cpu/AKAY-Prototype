<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Fixes a gap in 2026_09_03_000001's outcome expression: a referral blocked at
 * submission (DOC-14) never creates a `referrals` row - the only trace is a
 * `referral_holds` row with status = 'waiting'. The previous version only
 * used that hold to pick the sub-label, after already requiring
 * `needs_referral` or a `referrals` row to reach 'Referred' at all, so a
 * hold-only record fell through to 'Follow-up'/'Routine' with no sub-label.
 *
 * This mirrors the same fix made to HealthRecord::hasReferralDisposition()
 * (see that method's docblock) - a waiting hold now independently qualifies
 * as 'Referred', same as Decision 3 in HealthRecords-Redesign-Plan.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION akay_health_record_json(hr health_records)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'id', hr.id,
        'patient_id', hr.patient_id,
        'created_by', hr.created_by,
        'creator', CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', u.id,
            'name', u.name
        ) END,
        'barangay_health_center_id', hr.barangay_health_center_id,
        'rural_health_unit_id', hr.rural_health_unit_id,
        'date_recorded', hr.date_recorded,
        'vital_signs', hr.vital_signs,
        'visit_type', hr.visit_type,
        'visitType', hr.visit_type,
        'parent_health_record_id', hr.parent_health_record_id,
        'parentHealthRecordId', hr.parent_health_record_id,
        'category', hr.category,
        'maternal_data', hr.maternal_data,
        'immunization_data', hr.immunization_data,
        'monitoring_data', hr.monitoring_data,
        'family_planning_data', hr.family_planning_data,
        'familyPlanningData', hr.family_planning_data,
        'tb_data', hr.tb_data,
        'tbData', hr.tb_data,
        'needs_referral', hr.needs_referral,
        'outcome', CASE
            WHEN COALESCE(hr.needs_referral, false)
                 OR EXISTS (
                     SELECT 1 FROM referrals r WHERE r.health_record_id = hr.id
                 )
                 OR EXISTS (
                     SELECT 1 FROM referral_holds h
                     WHERE h.health_record_id = hr.id
                       AND h.status = 'waiting'
                 )
                THEN 'Referred'
            WHEN EXISTS (
                SELECT 1 FROM follow_up_tasks t
                WHERE t.health_record_id = hr.id
                  AND t.state IN ('pending', 'rescheduled', 'no_show')
            )
                THEN 'Follow-up'
            ELSE 'Routine'
        END,
        'outcome_sub_label', CASE
            WHEN (
                COALESCE(hr.needs_referral, false)
                OR EXISTS (
                    SELECT 1 FROM referrals r WHERE r.health_record_id = hr.id
                )
                OR EXISTS (
                    SELECT 1 FROM referral_holds h
                    WHERE h.health_record_id = hr.id
                      AND h.status = 'waiting'
                )
            ) AND EXISTS (
                SELECT 1 FROM referral_holds h
                WHERE h.health_record_id = hr.id
                  AND h.status = 'waiting'
            )
                THEN 'Awaiting Provider'
            ELSE NULL
        END,
        'outcomeSubLabel', CASE
            WHEN (
                COALESCE(hr.needs_referral, false)
                OR EXISTS (
                    SELECT 1 FROM referrals r WHERE r.health_record_id = hr.id
                )
                OR EXISTS (
                    SELECT 1 FROM referral_holds h
                    WHERE h.health_record_id = hr.id
                      AND h.status = 'waiting'
                )
            ) AND EXISTS (
                SELECT 1 FROM referral_holds h
                WHERE h.health_record_id = hr.id
                  AND h.status = 'waiting'
            )
                THEN 'Awaiting Provider'
            ELSE NULL
        END,
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
    LEFT JOIN users u ON u.id = hr.created_by
    WHERE p.id = hr.patient_id
$$;
SQL);
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION akay_health_record_json(hr health_records)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'id', hr.id,
        'patient_id', hr.patient_id,
        'created_by', hr.created_by,
        'creator', CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', u.id,
            'name', u.name
        ) END,
        'barangay_health_center_id', hr.barangay_health_center_id,
        'rural_health_unit_id', hr.rural_health_unit_id,
        'date_recorded', hr.date_recorded,
        'vital_signs', hr.vital_signs,
        'visit_type', hr.visit_type,
        'visitType', hr.visit_type,
        'parent_health_record_id', hr.parent_health_record_id,
        'parentHealthRecordId', hr.parent_health_record_id,
        'category', hr.category,
        'maternal_data', hr.maternal_data,
        'immunization_data', hr.immunization_data,
        'monitoring_data', hr.monitoring_data,
        'family_planning_data', hr.family_planning_data,
        'familyPlanningData', hr.family_planning_data,
        'tb_data', hr.tb_data,
        'tbData', hr.tb_data,
        'needs_referral', hr.needs_referral,
        'outcome', CASE
            WHEN COALESCE(hr.needs_referral, false)
                 OR EXISTS (
                     SELECT 1 FROM referrals r WHERE r.health_record_id = hr.id
                 )
                THEN 'Referred'
            WHEN EXISTS (
                SELECT 1 FROM follow_up_tasks t
                WHERE t.health_record_id = hr.id
                  AND t.state IN ('pending', 'rescheduled', 'no_show')
            )
                THEN 'Follow-up'
            ELSE 'Routine'
        END,
        'outcome_sub_label', CASE
            WHEN (
                COALESCE(hr.needs_referral, false)
                OR EXISTS (
                    SELECT 1 FROM referrals r WHERE r.health_record_id = hr.id
                )
            ) AND EXISTS (
                SELECT 1 FROM referral_holds h
                WHERE h.health_record_id = hr.id
                  AND h.status = 'waiting'
            )
                THEN 'Awaiting Provider'
            ELSE NULL
        END,
        'outcomeSubLabel', CASE
            WHEN (
                COALESCE(hr.needs_referral, false)
                OR EXISTS (
                    SELECT 1 FROM referrals r WHERE r.health_record_id = hr.id
                )
            ) AND EXISTS (
                SELECT 1 FROM referral_holds h
                WHERE h.health_record_id = hr.id
                  AND h.status = 'waiting'
            )
                THEN 'Awaiting Provider'
            ELSE NULL
        END,
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
    LEFT JOIN users u ON u.id = hr.created_by
    WHERE p.id = hr.patient_id
$$;
SQL);
    }
};
