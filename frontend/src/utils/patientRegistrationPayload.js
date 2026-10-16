export function splitName(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", middleName: "", lastName: "" };
  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    lastName: parts.at(-1) || "",
  };
}

// Same lists as backend PatientRequest and the history form's EDUCATION_LEVELS.
export const EDUCATION_LEVEL_OPTIONS = ['None', 'Elementary', 'High School', 'Senior High School', 'Vocational', 'College', 'Postgraduate'];
export const EDUCATION_COMPLETED_OPTIONS = ['Level', 'Graduate'];

const blank = (value) => (value === null || value === undefined ? '' : String(value));

/** The patient's saved Education (a Patient Information field), "" when not recorded. */
export function readEducation(patient = {}) {
  return {
    educationLevel: blank(patient.educationLevel ?? patient.education_level),
    educationCompleted: blank(patient.educationCompleted ?? patient.education_completed),
  };
}

export function toPayload(patient = {}) {
  // A present form field is authoritative, including an explicit clear/unlink.
  const read = (...keys) => {
    for (const key of keys) {
      if (Object.hasOwn(patient, key) && patient[key] !== undefined) return patient[key];
    }
    return undefined;
  };
  const optional = (...keys) => {
    const value = read(...keys);
    return value === '' || value == null ? null : value;
  };
  const hasHouseholdCommand = ['new', 'existing'].includes(patient.household?.kind);
  const parts = splitName(patient.name || patient.fullName);
  const ageSexParts = String(patient.ageSex || "").split("/");
  const philHealthStatus = optional('philHealthStatus', 'philhealthStatus', 'philhealth_status');
  const hasExplicitPhilHealthStatus = Boolean(philHealthStatus);
  const shouldSendPhilHealthNumber =
    !hasExplicitPhilHealthStatus || philHealthStatus === "With PhilHealth";
  const payload = {
    ...(hasHouseholdCommand ? {household:patient.household} : {}),
    ...(patient.head_replacement ? {head_replacement:patient.head_replacement} : {}),
    first_name: read('firstName', 'first_name') ?? parts.firstName,
    middle_name: optional('middleName', 'middle_name') ?? (Object.hasOwn(patient,'middleName') ? null : parts.middleName || null),
    last_name: read('lastName', 'last_name') ?? (parts.lastName || patient.firstName || 'Patient'),
    sex: patient.sex || ageSexParts[1]?.trim() || "Other",
    birthdate: optional('birthDate', 'birthdate', 'dateOfBirth'),
    contact_number: optional('contactNumber', 'contact_number', 'contact'),
    street_address: optional('streetAddress', 'street_address', 'address'),
    barangay: optional('barangay', 'patientBarangay'),
    municipality: optional('municipality'),
    purok_area: optional('purokArea', 'purok_area'),
    civil_status: optional('civilStatus', 'civil_status'),
    occupation: optional('occupation'),
    philhealth_status: philHealthStatus,
    spouse_name: optional('spouseName', 'spouse_name'),
    spouse_occupation: optional('spouseOccupation', 'spouse_occupation'),
    registration_type: read('registrationType', 'registration_type', 'patientType', 'patient_type') ?? 'general',
    mother_patient_id: optional('motherPatientId', 'mother_patient_id'),
    father_patient_id: optional('fatherPatientId', 'father_patient_id'),
    mother_name: optional('motherName', 'mother_name'),
    mother_birth_date: optional('motherBirthDate', 'mother_birth_date'),
    father_name: optional('fatherName', 'father_name'),
    father_birth_date: optional('fatherBirthDate', 'father_birth_date'),
    guardian_name: optional('guardianName', 'guardian_name'),
    guardian_relationship: optional('guardianRelationship', 'guardian_relationship'),
    guardian_contact_number: optional('guardianContactNumber', 'guardianContact', 'guardian_contact_number'),
    family_serial_number: optional('familySerialNumber', 'family_serial_number'),
    birth_place: optional('birthPlace', 'birth_place'),
    birth_time: optional('birthTime', 'birth_time'),
    birth_weight: optional('birthWeight', 'birth_weight'),
    birth_height: optional('birthHeight', 'birth_height'),
    nhts_status: optional('nhtsStatus', 'nhts_status'),
    philhealth_number: shouldSendPhilHealthNumber
      ? optional('philHealthNumber', 'philhealthNumber', 'philhealth_number')
      : null,
    philhealth_category: optional('philHealthCategory', 'philhealth_category'),
    status: patient.status || undefined,
    barangay_health_center_id: patient.barangayHealthCenterId || patient.bhcId || null,
    rural_health_unit_id: patient.ruralHealthUnitId || patient.rhuId || null,
  };

  const hasCategoryField = ["patientClassification", "patientCategory", "category"].some(
    (key) => Object.prototype.hasOwnProperty.call(patient, key),
  );

  if (hasCategoryField) {
    payload.patient_category =
      optional('patientClassification', 'patientCategory', 'category');
  }

  // Education is sent only by forms that carry it, so a form without the
  // fields never clears saved values; a present blank is an explicit clear.
  const educationKeys = { education_level: ['educationLevel', 'education_level'], education_completed: ['educationCompleted', 'education_completed'] };
  Object.entries(educationKeys).forEach(([field, keys]) => {
    if (keys.some((key) => Object.hasOwn(patient, key) && patient[key] !== undefined)) payload[field] = optional(...keys);
  });

  // medical_background is never sent: the API ignores it. The background
  // only changes through a finalized consultation.

  // Structured membership is authoritative; the compatibility serial is set by Laravel.
  if (hasHouseholdCommand) delete payload.family_serial_number;
  return payload;
}
