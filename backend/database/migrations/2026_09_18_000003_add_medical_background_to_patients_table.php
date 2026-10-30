<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Patient-level clinical background: the longitudinal history the Patient
 * Profile owns, as opposed to the per-visit snapshot health_records.medical_history
 * already holds.
 *
 * Stored as one JSON column rather than a table per section for the same reason
 * maternal_data / tb_data / family_planning_data are JSON on health_records:
 * the shape is a form the clinical team keeps revising, nothing joins or
 * aggregates across its keys, and every read is "load this one patient's
 * background". A relational split would buy nothing here and would need a
 * migration per field the proponents add.
 *
 * Shape (all keys optional):
 *   currentDiseases: [{ name, status, firstRecorded, lastConfirmed, source }]
 *   allergies, hospitalizations, surgeries: string
 *   familyHistory: { similarIllness, chronicIllness, hereditaryIllness }
 *   personalSocial: { diet, smoking, alcohol, notes }
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            if (! Schema::hasColumn('patients', 'medical_background')) {
                $table->json('medical_background')->nullable()->after('patient_category');
            }
        });

        $this->refreshPatientJsonFunction(includeMedicalBackground: true);
    }

    public function down(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            if (Schema::hasColumn('patients', 'medical_background')) {
                $table->dropColumn('medical_background');
            }
        });

        $this->refreshPatientJsonFunction(includeMedicalBackground: false);
    }

    private function refreshPatientJsonFunction(bool $includeMedicalBackground): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        $medicalBackgroundField = $includeMedicalBackground
            ? "        'medical_background', p.medical_background,\n"
            : '';

        DB::unprepared(<<<SQL
CREATE OR REPLACE FUNCTION akay_patient_json(p patients)
RETURNS jsonb
LANGUAGE sql
STABLE
AS \$\$
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
        'purok_area', p.purok_area,
        'civil_status', p.civil_status,
        'occupation', p.occupation,
        'philhealth_status', p.philhealth_status,
        'spouse_name', p.spouse_name,
        'spouse_occupation', p.spouse_occupation,
        'registration_type', p.registration_type,
        'mother_patient_id', p.mother_patient_id,
        'mother_patient', CASE WHEN mother.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', mother.id,
            'full_name', trim(concat_ws(' ', mother.first_name, mother.middle_name, mother.last_name)),
            'contact_number', mother.contact_number,
            'street_address', mother.street_address,
            'barangay', mother.barangay,
            'municipality', mother.municipality
        ) END,
        'mother_name', p.mother_name,
        'father_name', p.father_name,
        'guardian_name', p.guardian_name,
        'guardian_relationship', p.guardian_relationship,
        'guardian_contact_number', p.guardian_contact_number,
        'family_serial_number', p.family_serial_number,
        'birth_place', p.birth_place,
        'birth_time', p.birth_time,
        'birth_weight', p.birth_weight,
        'birth_height', p.birth_height,
        'nhts_status', p.nhts_status,
        'philhealth_number', p.philhealth_number,
        'philhealth_category', p.philhealth_category,
        'patient_category', p.patient_category,
{$medicalBackgroundField}        'status', p.status,
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
    LEFT JOIN patients mother ON mother.id = p.mother_patient_id
    WHERE patient_row.id = p.id
\$\$;
SQL);
    }
};
