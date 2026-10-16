<?php

namespace App\Services;

use App\Models\Patient;

class PatientIdentity
{
    public const HOUSEHOLD_FIELDS = ['id', 'first_name', 'middle_name', 'last_name', 'sex', 'birthdate', 'age', 'full_name', 'status', 'street_address', 'purok_area', 'barangay', 'municipality', 'household_id', 'family_serial_number', 'relationship_to_household_head', 'mother_patient_id', 'father_patient_id'];

    public const FIELDS = ['id', 'first_name', 'middle_name', 'last_name', 'suffix', 'sex', 'birthdate', 'contact_number', 'barangay', 'municipality', 'street_address', 'purok_area', 'barangay_health_center_id', 'rural_health_unit_id', 'status', 'household_id', 'family_serial_number', 'relationship_to_household_head', 'civil_status', 'occupation', 'education_level', 'education_completed', 'philhealth_status', 'philhealth_number', 'philhealth_category', 'spouse_name', 'spouse_occupation', 'registration_type', 'mother_patient_id', 'father_patient_id', 'mother_name', 'father_name', 'mother_birth_date', 'father_birth_date', 'guardian_name', 'guardian_relationship', 'guardian_contact_number', 'birth_place', 'birth_time', 'birth_weight', 'birth_height', 'nhts_status', 'patient_category'];

    public static function response(Patient $patient, bool $withHousehold = true): array
    {
        // Respect date:Y-m-d casts; only() returns raw Carbon objects which
        // encode midnight Manila as the previous UTC calendar day.
        $data = [...array_intersect_key($patient->attributesToArray(), array_flip(self::FIELDS)), 'full_name' => $patient->full_name, 'age' => $patient->age];
        if ($withHousehold) {
            $data['household'] = $patient->household?->only(['id', 'serial_number', 'address', 'head_patient_id', 'version', 'archived_at', 'members_count']);
        }

        return $data;
    }

    public static function householdResponse(Patient $patient, bool $withHousehold = false): array
    {
        $data = array_intersect_key(self::response($patient, false), array_flip(self::HOUSEHOLD_FIELDS));
        if ($withHousehold) {
            $data['household'] = $patient->household?->only(['id', 'serial_number', 'address', 'head_patient_id', 'version', 'archived_at', 'members_count']);
        }

        return $data;
    }
}
