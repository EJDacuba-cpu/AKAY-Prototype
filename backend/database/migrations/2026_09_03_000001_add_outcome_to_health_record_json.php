<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Expose the resolved records-list disposition (Referred > Follow-up > Routine)
 * through the stored function the admin list/detail path reads.
 *
 * WHY DERIVED, NOT STORED
 * -----------------------
 * A referral can be accepted and a follow-up task fulfilled, cancelled or
 * no-showed long after the health record row is written. A column holding this
 * would be stale the moment the workflow moved on, and keeping it honest would
 * mean triggers on referrals, follow_up_tasks and referral_holds.
 *
 * WHY INLINE, NOT A HELPER FUNCTION
 * ---------------------------------
 * The expressions below are deliberately repeated rather than factored into an
 * akay_health_record_outcome() helper. Every akay_* routine is covered by the
 * containment contract in 2026_07_30_000001 (EXECUTE revoked from the browser
 * roles, asserted per overload by DatabaseExposureContainmentTest). A new
 * routine created after that migration ran would be a new object that
 * migration never revoked, so the cheaper-looking refactor would quietly widen
 * the exposed surface. Editing a function that is already revoked does not.
 *
 * This SQL is the mirror of HealthRecord::getOutcomeAttribute() and
 * getOutcomeSubLabelAttribute(), which serve the non-admin Eloquent path. The
 * two must be changed together - the precedence, the active follow-up states
 * ('pending', 'rescheduled', 'no_show' = FollowUpTask::ACTIVE_STATES) and the
 * 'waiting' hold status are duplicated between them.
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
