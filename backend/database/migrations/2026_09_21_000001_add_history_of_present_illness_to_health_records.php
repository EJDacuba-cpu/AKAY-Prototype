<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * History of Present Illness becomes a first-class health-record column.
 *
 * It was previously written to health_records.medical_history (and, when no
 * consultation notes were typed, copied into health_records.notes as well).
 * Existing rows are left untouched - nothing is migrated, copied or deleted -
 * and the readers fall back to medical_history and then notes, so older
 * records keep displaying their HPI. Only new writes use the column.
 *
 * NOT the same thing as the Patient Profile's Past Medical History, which is
 * patients.medical_background and is not touched here.
 *
 * The stored function is re-created because the admin list/detail path builds
 * its JSON from an explicit key list; a new column is invisible there until it
 * is named. Per the containment contract in 2026_07_30_000001 this edits the
 * existing revoked function rather than adding a new routine.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('health_records', function (Blueprint $table) {
            $table->text('history_of_present_illness')->nullable()->after('physical_exam');
        });

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
        'physical_exam', hr.physical_exam,
        'physicalExam', hr.physical_exam,
        'history_of_present_illness', hr.history_of_present_illness,
        'historyOfPresentIllness', hr.history_of_present_illness,
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
        Schema::table('health_records', function (Blueprint $table) {
            $table->dropColumn('history_of_present_illness');
        });

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
        'physical_exam', hr.physical_exam,
        'physicalExam', hr.physical_exam,
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
