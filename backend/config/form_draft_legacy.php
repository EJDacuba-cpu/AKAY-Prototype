<?php

use App\Services\PatientBackground;

// Draft schemas deliberately allow incomplete scalar input; final requests own domain validation.
$fields = static fn (string $names): array => array_fill_keys(explode(' ', $names), true);
$address = $fields('streetAddress purokArea barangay municipality');
$replacement = [...$fields('household_id head_patient_id version'), 'relationships' => ['*' => true]];
$household = [...$fields('kind household_id relationship version serial_mode serial_number'), 'address' => $address, 'relationship_link' => $fields('type')];
$registration = [...$fields('first_name middle_name last_name sex birthdate contact_number street_address barangay municipality purok_area civil_status occupation education_level education_completed philhealth_status spouse_name spouse_occupation registration_type mother_patient_id father_patient_id mother_name mother_birth_date father_name father_birth_date guardian_name guardian_relationship guardian_contact_number family_serial_number birth_place birth_time birth_weight birth_height nhts_status philhealth_number philhealth_category patient_category status barangay_health_center_id rural_health_unit_id'), 'household' => $household, 'head_replacement' => $replacement];
$entry = static fn (array $roles, ?string $permission, array $contexts, array $schema): array => compact('roles', 'permission', 'contexts', 'schema');
$clinical = ['bhc', 'rhu'];
$patient = ['create' => ['new', 'household'], 'edit' => ['patient']];
$forms = [
    'patient' => $entry(['admin', ...$clinical], 'patients.register', $patient, $registration),
    'household' => $entry($clinical, 'families.manage', ['create' => ['new'], 'edit' => ['household']], [...$fields('head_patient_id serial_mode serial_number version'), 'address' => $address, 'relationships' => ['*' => true], 'head_replacement' => $replacement]),
    'household-transfer' => $entry($clinical, 'patients.register', ['edit' => ['patient']], ['household' => $household, 'head_replacement' => $replacement]),
    'household-relationship' => $entry($clinical, 'families.manage', ['create' => ['household'], 'edit' => ['relationship']], $fields('version patient_id relative_id type')),
    'patient-parent-mother' => $entry($clinical, 'patients.register', ['edit' => ['patient']], ['mother_patient_id' => true, 'parent_link_base' => $fields('mother_patient_id')]),
    'patient-parent-father' => $entry($clinical, 'patients.register', ['edit' => ['patient']], ['father_patient_id' => true, 'parent_link_base' => $fields('father_patient_id')]),
    'referral' => $entry(['bhc'], 'referrals.submit', ['create' => ['patient']], $fields('patient_id rural_health_unit_id health_record_id referral_category urgency_level reason_for_referral chief_complaint initial_diagnosis initial_action_taken referring_practitioner referral_datetime remarks resume_hold_id')),
    'referral-status' => $entry(['rhu'], 'rhu.manage', ['edit' => ['referral']], $fields('status remarks')),
    'referral-intake' => $entry(['rhu'], 'rhu.intake', ['edit' => ['referral']], $fields('status remarks')),
    'referral-reschedule' => $entry(['rhu'], 'rhu.manage', ['edit' => ['referral']], $fields('rescheduled_to reschedule_reason')),
    'referral-hold-discard' => $entry(['bhc'], 'referrals.submit', ['edit' => ['hold']], $fields('reason')),
    'feedback' => $entry(['rhu'], 'rhu.manage', ['create' => ['referral']], $fields('referral_id received_at rhu_diagnosis action_taken treatment_notes recommendation receiving_practitioner remarks')),
    'nutrition-close' => $entry($clinical, 'consultations.finalize', ['edit' => ['patient']], $fields('reason closed_on note')),
    'record-correction' => $entry($clinical, 'records.correct', ['create' => ['record']], $fields('original_entry addendum reason')),
    'visit-check-in' => $entry(['rhu'], 'patients.register', ['create' => ['patient']], $fields('patient_id referral_id')),
    'visit-close' => $entry(['rhu'], 'patients.register', ['edit' => ['visit']], $fields('reason note')),
    'visit-start' => $entry(['rhu'], 'consultations.encode', ['edit' => ['visit']], ['follow_up_task_ids' => ['*' => true]]),
    'medicine' => $entry($clinical, 'inventory.manage', ['create' => ['new'], 'edit' => ['medicine']], $fields('name category description quantity low_stock_threshold unit item_type expiry_not_applicable expiration_date')),
    'medicine-restock' => $entry($clinical, 'inventory.manage', ['edit' => ['medicine']], $fields('expiration_date expiry_not_applicable quantity reason')),
    'medicine-deduct' => $entry($clinical, 'inventory.manage', ['edit' => ['medicine']], $fields('expiry_group_id quantity reason')),
    'medicine-adjust' => $entry($clinical, 'inventory.manage', ['edit' => ['medicine']], $fields('action expiry_group_id pool target direction quantity reason')),
    'medicine-group-action' => $entry($clinical, 'inventory.manage', ['edit' => ['medicine']], $fields('action expiry_group_id quantity reason expiration_date expiry_not_applicable')),
    'medicine-verify' => $entry($clinical, 'inventory.manage', ['edit' => ['medicine']], ['groups' => ['*' => $fields('expiry_group_id quantity expiration_date expiry_not_applicable')], ...$fields('reason')]),
    'dispensing' => $entry($clinical, 'items.dispense', ['edit' => ['record']], ['dispensed_medicines' => ['*' => $fields('medicine_id quantity prescription_item_id')]]),
    'provider' => $entry(['rhu'], 'rhu.providers.manage', ['create' => ['new'], 'edit' => ['provider']], $fields('name specialization availability_status remarks internal_notes expected_available_at')),
    'provider-absence' => $entry(['rhu'], 'rhu.providers.manage', ['create' => ['provider'], 'edit' => ['absence']], $fields('local_date all_day start_time end_time')),
    'patient-volume' => $entry(['rhu'], 'rhu.manage', ['edit' => ['new']], $fields('status')),
    'account' => $entry(['admin'], null, ['create' => ['new'], 'edit' => ['user']], [...$fields('name email contact_number role status staff_role barangay_health_center_id rural_health_unit_id'), 'permissions' => ['*' => true]]),
    'staff-assignment' => $entry(['admin'], null, ['create' => ['new']], [...$fields('user_id barangay_health_center_id starts_on assignment_type ends_on'), 'permissions' => ['*' => true]]),
    'invite-email' => $entry(['admin'], null, ['edit' => ['invite']], $fields('email')),
    'reset-rejection' => $entry(['admin'], null, ['edit' => ['reset']], $fields('admin_note')),
    'facility-bhc' => $entry(['admin'], null, ['create' => ['new'], 'edit' => ['bhc']], [...$fields('name barangay address contact_information status rural_health_unit_id'), 'alternative_rhu_ids' => ['*' => true]]),
    'facility-rhu' => $entry(['admin'], null, ['create' => ['new'], 'edit' => ['rhu']], $fields('name barangay address contact_information status')),
    'handoff-link' => $entry(['bhc'], 'consultations.encode', ['edit' => ['handoff']], $fields('linked_patient_id')),
    'handoff-register-source' => $entry(['bhc'], 'consultations.encode', ['edit' => ['handoff']], ['*' => true]),
    'handoff-flag-identity-review' => $entry(['bhc'], 'consultations.encode', ['edit' => ['handoff']], $fields('note')),
    'handoff-decline' => $entry(['bhc'], 'consultations.encode', ['edit' => ['handoff']], $fields('reason')),
];
foreach (['no-show', 'reschedule', 'cancel'] as $action) {
    $forms['follow-up-'.$action] = $entry($clinical, 'followups.manage', ['edit' => ['follow-up']], $fields($action === 'reschedule' ? 'due_date due_time notes' : 'notes'));
}
$forms['account-profile'] = $entry(['admin'], null, ['edit' => ['user']], $fields('name email contact_number'));
$forms['referral']['schema'] += $fields('dateOfReferral timeOfReferral preferredVisitDate preferredVisitTime philHealthNumber philHealthCategory');
$forms['feedback']['schema'] += [
    'condition_confirmations' => ['*' => $fields('condition_id name status note recommend_bhc_monitoring')],
    'legacy_monitoring_discontinuations' => ['*' => $fields('monitoring_id reason')],
    // Preserve unfinished row input before final serializers filter selected rows.
    // Confirmation checkboxes are intentionally absent and must be reconfirmed.
    'condition_rows' => ['*' => $fields('conditionId name status note recommend legacyMonitoringId')],
    'legacy_rows' => ['*' => $fields('monitoringId decision correctedName reason')],
    ...$fields('dateReceived timeReceived assessmentOutcome followUpDate'),
];
$forms['dispensing']['schema']['dispensed_medicines']['*'] = [...$fields('medicine_id quantity unit remarks override_reason'), 'allocations' => ['*' => $fields('expiry_group_id quantity')]];
$forms['provider-availability'] = $entry(['rhu'], 'rhu.providers.manage', ['edit' => ['provider']], [...$fields('doctorId status untilFurtherNotice date allDay startTime endTime notesTouched'), 'notes' => $fields('remarks internal returnDate returnTime')]);
foreach (['quarantine', 'release', 'quarantine-disposal'] as $action) {
    $forms['medicine-'.$action] = $entry($clinical, 'inventory.manage', ['edit' => ['medicine']], $fields('expiry_group_id quantity reason'));
}
$forms['medicine-verify']['schema'] = ['groups' => ['*' => $fields('id available_quantity quarantined_quantity')], ...$fields('unassigned_quantity snapshot reason')];
// Reuse the clinical background's explicit schema, never arbitrary object contents.
foreach (['medical', 'family', 'social', 'obstetric'] as $section) {
    $node = PatientBackground::draftSchema('base_revisions');
    $forms['patient-background-'.$section] = $entry(['bhc'], 'clinical.background.update', ['edit' => ['patient']], ['background_update' => ['sections' => [$section => $node['sections'][$section]], 'base_revisions' => [$section => true]]]);
}

return ['retention_days' => 7, 'max_payload_bytes' => 131072, 'max_string_length' => 20000, 'max_array_items' => 100, 'write_limit' => 30, 'forms' => $forms];
