import { isInfantPatient } from "./patientUtils.js";

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

export const REGISTRATION_DRAFT_FIELDS = "firstName middleName lastName birthDate age sex civilStatus occupation educationLevel educationCompleted spouseName spouseOccupation contactNumber philHealthStatus philHealthNumber purokArea streetAddress barangay municipality motherName motherBirthDate fatherName fatherBirthDate guardianName guardianRelationship guardianContactNumber familySerialNumber nhtsStatus patientClassification motherPatientId fatherPatientId".split(" ");
const snapshotError = () => Object.assign(new Error("The registration recovery snapshot is invalid. Keep it and retry."), { code: "DRAFT_SNAPSHOT_INVALID" });
function scalarFields(value, keys) {
  const result = {};
  for (const key of keys) {
    if (!Object.hasOwn(value || {}, key)) continue;
    if (value[key] !== null && typeof value[key] === "object") throw snapshotError();
    result[key] = value[key] ?? "";
  }
  return result;
}
function registrationConnection(value) {
  if (!value) return null;
  if (!["existing", "new"].includes(value.kind)) throw snapshotError();
  const result = scalarFields(value, ["kind", "householdId", "relationship", "headPatientId"]);
  if (value.household) result.household = {
    ...scalarFields(value.household, ["serialMode", "serialNumber"]),
    address: scalarFields(value.household.address, ["streetAddress", "purokArea", "barangay", "municipality"]),
  };
  if (value.relationshipLink) result.relationshipLink = scalarFields(value.relationshipLink, ["type"]);
  return result;
}
function registrationReplacement(value) {
  if (!value) return null;
  return { ...scalarFields(value, ["householdId", "headPatientId", "version"]), relationships: scalarFields(value.relationships, Object.keys(value.relationships || {})) };
}

export function registrationRecoveryEnabled({ role, live, patientId, createdPatientId }) {
  return Boolean(live && ["bhc", "rhu"].includes(role) && !patientId && !createdPatientId);
}

/** Raw unfinished input only: final serializers intentionally omit hidden fields. */
export function registrationDraftSnapshot({ form, connection = null, headReplacement = null, householdVersion = null, walkIn = null }) {
  return { registration: {
    form: scalarFields(form, REGISTRATION_DRAFT_FIELDS),
    ...(connection ? { connection: registrationConnection(connection) } : {}),
    ...(headReplacement ? { headReplacement: registrationReplacement(headReplacement) } : {}),
    householdVersion: householdVersion ?? null,
    ...(walkIn?.key ? { walkIn: { key: String(walkIn.key) } } : {}),
  } };
}

export function restoreRegistrationDraft(payload, defaults) {
  let saved = payload?.registration;
  if (!saved) {
    const names = {
      first_name: "firstName", middle_name: "middleName", last_name: "lastName", birthdate: "birthDate", sex: "sex",
      contact_number: "contactNumber", street_address: "streetAddress", barangay: "barangay", municipality: "municipality", purok_area: "purokArea",
      civil_status: "civilStatus", occupation: "occupation", education_level: "educationLevel", education_completed: "educationCompleted",
      philhealth_status: "philHealthStatus", philhealth_number: "philHealthNumber", spouse_name: "spouseName", spouse_occupation: "spouseOccupation",
      mother_name: "motherName", mother_birth_date: "motherBirthDate", father_name: "fatherName", father_birth_date: "fatherBirthDate",
      guardian_name: "guardianName", guardian_relationship: "guardianRelationship", guardian_contact_number: "guardianContactNumber",
      family_serial_number: "familySerialNumber", nhts_status: "nhtsStatus", patient_category: "patientClassification",
    };
    const form = Object.fromEntries(Object.entries(names).filter(([key]) => Object.hasOwn(payload || {}, key)).map(([key, target]) => [target, payload[key]]));
    if (!Object.keys(form).length) throw snapshotError();
    const household = payload.household;
    const connection = !household ? null : household.kind === "existing"
      ? { kind: "existing", householdId: String(household.household_id), relationship: household.relationship || "" }
      : { kind: "new", headPatientId: "self", household: { serialMode: household.serial_mode || "auto", serialNumber: household.serial_number || "", address: household.address || {} } };
    saved = { form, connection, householdVersion: household?.version ?? null };
  }
  if (!saved.form || typeof saved.form !== "object" || Array.isArray(saved.form)) throw snapshotError();
  return {
    form: { ...defaults, ...scalarFields(saved.form, REGISTRATION_DRAFT_FIELDS) },
    connection: registrationConnection(saved.connection), headReplacement: registrationReplacement(saved.headReplacement),
    householdVersion: saved.householdVersion ?? null, walkIn: saved.walkIn?.key ? { key: String(saved.walkIn.key) } : null,
  };
}

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
    ...(patient.check_in ? {check_in:patient.check_in} : {}),
    ...(patient.confirm_possible_duplicate ? {confirm_possible_duplicate:true} : {}),
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

  // FSN is sent only when the form explicitly carries it. Missing keys must not
  // invent family_serial_number: null (that would break edit of household members).
  const fsnKeys = ['familySerialNumber', 'family_serial_number'];
  if (fsnKeys.some((key) => Object.hasOwn(patient, key) && patient[key] !== undefined)) {
    payload.family_serial_number = optional(...fsnKeys);
  }

  // Birth details (place, time, weight, height) are not part of general registration, so they are never
  // sent and stored values stay untouched. Parent links are sent only by forms that carry them, so a
  // profile edit never clears a stored mother/father link.
  const parentLinkKeys = { mother_patient_id: ['motherPatientId', 'mother_patient_id'], father_patient_id: ['fatherPatientId', 'father_patient_id'] };
  Object.entries(parentLinkKeys).forEach(([field, keys]) => {
    if (!keys.some((key) => Object.hasOwn(patient, key) && patient[key] !== undefined)) delete payload[field];
  });

  // medical_background is never sent: the API ignores it. The background
  // only changes through a finalized consultation.

  // Structured membership is authoritative; the compatibility serial is set by Laravel.
  if (hasHouseholdCommand) delete payload.family_serial_number;

  // Infant registration hides adult socio-demographic fields. Omit the keys
  // rather than sending null/"Single" so a DOB change cannot wipe stored values.
  if (isInfantPatient(payload.birthdate)) {
    for (const field of [
      "civil_status",
      "occupation",
      "education_level",
      "education_completed",
      "nhts_status",
      "spouse_name",
      "spouse_occupation",
    ]) {
      delete payload[field];
    }
  }

  return payload;
}

