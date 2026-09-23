<?php

namespace App\Services;

use App\Models\Patient;

class PatientIdentity
{
    public const FIELDS = ['id', 'first_name', 'middle_name', 'last_name', 'suffix', 'sex', 'birthdate', 'contact_number', 'barangay', 'street_address', 'purok_area', 'barangay_health_center_id', 'rural_health_unit_id', 'status'];

    public static function response(Patient $patient): array
    {
        return [...$patient->only(self::FIELDS), 'full_name' => $patient->full_name];
    }
}
