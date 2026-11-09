<?php

// New enrollment is limited to registration. Clinical recovery keeps its existing service.
$fields = static fn (string $names): array => array_fill_keys(explode(' ', $names), true);
$address = $fields('streetAddress purokArea barangay municipality');
$registration = [
    ...$fields('first_name middle_name last_name sex birthdate contact_number street_address barangay municipality purok_area civil_status occupation education_level education_completed philhealth_status spouse_name spouse_occupation registration_type mother_patient_id father_patient_id mother_name mother_birth_date father_name father_birth_date guardian_name guardian_relationship guardian_contact_number family_serial_number birth_place birth_time birth_weight birth_height nhts_status philhealth_number philhealth_category patient_category status barangay_health_center_id rural_health_unit_id'),
    'household' => [...$fields('kind household_id relationship version serial_mode serial_number'), 'address' => $address, 'relationship_link' => $fields('type')],
    'head_replacement' => [...$fields('household_id head_patient_id version'), 'relationships' => ['*' => true]],
];
$registration['registration'] = [
    'form' => $fields('firstName middleName lastName birthDate age sex civilStatus occupation educationLevel educationCompleted spouseName spouseOccupation contactNumber philHealthStatus philHealthNumber purokArea streetAddress barangay municipality motherName motherBirthDate fatherName fatherBirthDate guardianName guardianRelationship guardianContactNumber familySerialNumber nhtsStatus patientClassification motherPatientId fatherPatientId'),
    'connection' => [...$fields('kind householdId relationship headPatientId'),
        'household' => [...$fields('serialMode serialNumber'), 'address' => $address], 'relationshipLink' => $fields('type')],
    'headReplacement' => [...$fields('householdId headPatientId version'), 'relationships' => ['*' => true]],
    'householdVersion' => true, 'walkIn' => $fields('key'),
];
$legacy = (static fn () => require __DIR__.'/form_draft_legacy.php')();

return [
    'retention_days' => 7, 'max_payload_bytes' => 131072, 'max_string_length' => 20000,
    'max_array_items' => 100, 'write_limit' => 30,
    'forms' => ['patient' => [
        'roles' => ['bhc', 'rhu'], 'permission' => 'patients.register',
        'contexts' => ['create' => ['new', 'household']], 'schema' => $registration,
    ]],
    // Compatibility metadata cannot enroll a new draft.
    'legacy_forms' => $legacy['forms'],
];
