<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The Family Serial Number is the household: a child's Mother and Father are
 * linked from the registered members sharing its serial. The father gets the
 * same real link the mother already has, and both parents' birthdates are
 * stored - the registration form always collected them, but nothing kept them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            if (! Schema::hasColumn('patients', 'father_patient_id')) {
                $table
                    ->foreignId('father_patient_id')
                    ->nullable()
                    ->after('mother_patient_id')
                    ->constrained('patients')
                    ->nullOnDelete();
            }
            if (! Schema::hasColumn('patients', 'mother_birth_date')) {
                $table->date('mother_birth_date')->nullable()->after('mother_name');
            }
            if (! Schema::hasColumn('patients', 'father_birth_date')) {
                $table->date('father_birth_date')->nullable()->after('father_name');
            }
        });

        $this->refreshPatientJsonFunction(includeFatherLink: true);
    }

    public function down(): void
    {
        $this->refreshPatientJsonFunction(includeFatherLink: false);

        Schema::table('patients', function (Blueprint $table) {
            if (Schema::hasColumn('patients', 'father_patient_id')) {
                $table->dropConstrainedForeignId('father_patient_id');
            }
            foreach (['mother_birth_date', 'father_birth_date'] as $column) {
                if (Schema::hasColumn('patients', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }

    private function refreshPatientJsonFunction(bool $includeFatherLink): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        $fatherFields = $includeFatherLink
            ? <<<SQL
        'father_patient_id', p.father_patient_id,
        'father_patient', CASE WHEN father.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', father.id,
            'full_name', trim(concat_ws(' ', father.first_name, father.middle_name, father.last_name)),
            'contact_number', father.contact_number,
            'street_address', father.street_address,
            'barangay', father.barangay,
            'municipality', father.municipality
        ) END,
        'mother_birth_date', p.mother_birth_date,
        'father_birth_date', p.father_birth_date,

SQL
            : '';

        $fatherJoin = $includeFatherLink
            ? "    LEFT JOIN patients father ON father.id = p.father_patient_id\n"
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
{$fatherFields}        'mother_name', p.mother_name,
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
        'medical_background', p.medical_background,
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
    LEFT JOIN patients mother ON mother.id = p.mother_patient_id
{$fatherJoin}    WHERE patient_row.id = p.id
\$\$;
SQL);
    }
};
