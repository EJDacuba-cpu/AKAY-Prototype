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
        'visit_type', hr.visit_type,
        'visitType', hr.visit_type,
        'parent_health_record_id', hr.parent_health_record_id,
        'parentHealthRecordId', hr.parent_health_record_id,
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
SQL);
    }
};
