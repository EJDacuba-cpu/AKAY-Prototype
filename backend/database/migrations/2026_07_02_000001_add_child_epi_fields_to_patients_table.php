<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $columns = [
                'registration_type' => fn () => $table->string('registration_type')->nullable()->index(),
                'mother_name' => fn () => $table->string('mother_name')->nullable(),
                'father_name' => fn () => $table->string('father_name')->nullable(),
                'family_serial_number' => fn () => $table->string('family_serial_number')->nullable()->index(),
                'birth_place' => fn () => $table->string('birth_place')->nullable(),
                'birth_time' => fn () => $table->time('birth_time')->nullable(),
                'birth_weight' => fn () => $table->decimal('birth_weight', 6, 2)->nullable(),
                'birth_height' => fn () => $table->decimal('birth_height', 6, 2)->nullable(),
                'nhts_status' => fn () => $table->string('nhts_status')->nullable(),
            ];

            foreach ($columns as $column => $definition) {
                if (!Schema::hasColumn('patients', $column)) {
                    $definition();
                }
            }
        });

        $this->restorePatientJsonFunctionWithoutChildFields();
    }

    public function down(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $columns = [
                'registration_type',
                'mother_name',
                'father_name',
                'family_serial_number',
                'birth_place',
                'birth_time',
                'birth_weight',
                'birth_height',
                'nhts_status',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('patients', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        $this->refreshPatientJsonFunction();
    }

    private function refreshPatientJsonFunction(): void
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
        'registration_type', p.registration_type,
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
SQL);
    }

    private function restorePatientJsonFunctionWithoutChildFields(): void
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
        'guardian_name', p.guardian_name,
        'guardian_relationship', p.guardian_relationship,
        'guardian_contact_number', p.guardian_contact_number,
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
SQL);
    }
};
