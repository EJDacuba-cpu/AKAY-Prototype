import { apiRequest, unwrapData, unwrapList } from "./apiClient";
import { getHealthRecordsByPatient } from "./healthRecordService";
import { getReferralsByPatient } from "./referrals";

function splitName(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", middleName: "", lastName: "" };
  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    lastName: parts.at(-1) || "",
  };
}

function fullName(patient = {}) {
  return (
    patient.full_name ||
    patient.fullName ||
    patient.name ||
    [patient.first_name, patient.middle_name, patient.last_name]
      .filter(Boolean)
      .join(" ")
      .trim()
  );
}

function normalizeDate(value) {
  if (!value) return "";
  return String(value).split("T")[0];
}

export const EMPTY_MEDICAL_BACKGROUND = {
  currentDiseases: [],
  allergies: "",
  hospitalizations: "",
  surgeries: "",
  familyHistory: {
    similarIllness: "",
    chronicIllness: "",
    hereditaryIllness: "",
  },
  personalSocial: {
    diet: "",
    smoking: "",
    alcohol: "",
    notes: "",
  },
  // When each section was last edited, so the profile can date the record
  // rather than showing background of unknown vintage. Not a revision log:
  // it answers "is this current?", which is the question a BHW actually asks.
  updatedAt: {
    medical: "",
    family: "",
    social: "",
  },
};

/**
 * Patient-level clinical background. Always returns the full shape so the
 * profile can render read-only sections without per-field guards; an older
 * patient row with no background at all reads as "not yet recorded" rather
 * than crashing on a missing sub-object.
 */
export function normalizeMedicalBackground(source) {
  const background = source && typeof source === "object" ? source : {};

  return {
    currentDiseases: Array.isArray(background.currentDiseases)
      ? background.currentDiseases
          .filter((entry) => entry && typeof entry === "object")
          .map((entry) => ({
            name: entry.name || "",
            status: entry.status || "",
            firstRecorded: normalizeDate(entry.firstRecorded),
            lastConfirmed: normalizeDate(entry.lastConfirmed),
            source: entry.source || "",
          }))
      : [],
    allergies: background.allergies || "",
    hospitalizations: background.hospitalizations || "",
    surgeries: background.surgeries || "",
    familyHistory: {
      ...EMPTY_MEDICAL_BACKGROUND.familyHistory,
      ...(background.familyHistory || {}),
    },
    personalSocial: {
      ...EMPTY_MEDICAL_BACKGROUND.personalSocial,
      ...(background.personalSocial || {}),
    },
    updatedAt: {
      ...EMPTY_MEDICAL_BACKGROUND.updatedAt,
      ...(background.updatedAt || {}),
    },
  };
}

export function normalizePatient(patient = {}) {
  const nameParts = splitName(patient.name || patient.fullName);
  const firstName = patient.first_name || patient.firstName || nameParts.firstName;
  const middleName = patient.middle_name || patient.middleName || nameParts.middleName;
  const lastName = patient.last_name || patient.lastName || nameParts.lastName;
  const name = fullName({ ...patient, first_name: firstName, middle_name: middleName, last_name: lastName });
  const birthDate = normalizeDate(
    patient.birthdate || patient.birthDate || patient.dateOfBirth || patient.date_of_birth || patient.dob,
  );
  const dateRegistered =
    patient.created_at ||
    patient.date_registered ||
    patient.dateRegistered ||
    patient.createdAt ||
    patient.registeredAt ||
    "";
  const linkedMother =
    patient.mother_patient || patient.motherPatient || patient.mother || null;
  const linkedMotherId =
    patient.mother_patient_id || patient.motherPatientId || linkedMother?.id || "";

  return {
    ...patient,
    id: patient.id ? String(patient.id) : "",
    patientId: patient.patientId || (patient.id ? String(patient.id) : ""),
    firstName,
    middleName,
    lastName,
    name,
    fullName: name,
    sex: patient.sex || "",
    birthdate: birthDate,
    birthDate,
    dateOfBirth: birthDate,
    age: patient.age ?? "",
    ageSex:
      patient.ageSex ||
      [patient.age ? `${patient.age} yrs` : "", patient.sex].filter(Boolean).join(" / "),
    contactNumber: patient.contact_number || patient.contactNumber || patient.contact || "",
    contact: patient.contact_number || patient.contactNumber || patient.contact || "",
    streetAddress: patient.street_address || patient.streetAddress || patient.address || "",
    address: patient.street_address || patient.streetAddress || patient.address || "",
    barangay: patient.barangay || "",
    municipality: patient.municipality || "",
    purokArea: patient.purok_area || patient.purokArea || "",
    purok_area: patient.purok_area || patient.purokArea || "",
    civilStatus: patient.civil_status || patient.civilStatus || "",
    occupation: patient.occupation || "",
    philHealthStatus:
      patient.philhealth_status ||
      patient.philHealthStatus ||
      patient.philhealthStatus ||
      "",
    spouseName: patient.spouse_name || patient.spouseName || "",
    spouseOccupation:
      patient.spouse_occupation || patient.spouseOccupation || "",
    registrationType:
      patient.registration_type || patient.registrationType || patient.patientType || "",
    patientType:
      patient.registration_type || patient.registrationType || patient.patientType || "",
    motherPatientId: linkedMotherId ? String(linkedMotherId) : "",
    mother_patient_id: linkedMotherId ? String(linkedMotherId) : "",
    motherPatient: linkedMother,
    motherName: patient.mother_name || patient.motherName || "",
    fatherName: patient.father_name || patient.fatherName || "",
    guardianName: patient.guardian_name || patient.guardianName || "",
    guardianRelationship:
      patient.guardian_relationship || patient.guardianRelationship || "",
    guardianContactNumber:
      patient.guardian_contact_number ||
      patient.guardianContactNumber ||
      patient.guardianContact ||
      "",
    guardianContact:
      patient.guardian_contact_number ||
      patient.guardianContactNumber ||
      patient.guardianContact ||
      "",
    familySerialNumber:
      patient.family_serial_number || patient.familySerialNumber || "",
    birthPlace: patient.birth_place || patient.birthPlace || "",
    birthTime: patient.birth_time || patient.birthTime || "",
    birthWeight: patient.birth_weight || patient.birthWeight || "",
    birthHeight: patient.birth_height || patient.birthHeight || "",
    nhtsStatus: patient.nhts_status || patient.nhtsStatus || "",
    philHealthNumber: patient.philhealth_number || patient.philHealthNumber || "",
    philhealthNumber: patient.philhealth_number || patient.philhealthNumber || "",
    philHealthCategory: patient.philhealth_category || patient.philHealthCategory || "",
    patientClassification:
      patient.patient_category ||
      patient.patientClassification ||
      patient.category ||
      "",
    patientCategory: patient.patient_category || patient.patientCategory || "",
    category: patient.patient_category || patient.category || "",
    medicalBackground: normalizeMedicalBackground(
      patient.medical_background || patient.medicalBackground,
    ),
    status: patient.status || "active",
    dateRegistered,
    date_registered: patient.date_registered || patient.created_at || "",
    createdAt: patient.created_at || patient.createdAt || "",
    created_at: patient.created_at || "",
    barangayHealthCenterId: patient.barangay_health_center_id || "",
    ruralHealthUnitId: patient.rural_health_unit_id || "",
  };
}

function toPayload(patient = {}) {
  const parts = splitName(patient.name || patient.fullName);
  const ageSexParts = String(patient.ageSex || "").split("/");
  const philHealthStatus =
    patient.philHealthStatus || patient.philhealthStatus || patient.philhealth_status || null;
  const hasExplicitPhilHealthStatus = Boolean(philHealthStatus);
  const shouldSendPhilHealthNumber =
    !hasExplicitPhilHealthStatus || philHealthStatus === "With PhilHealth";
  const payload = {
    first_name: patient.firstName || parts.firstName,
    middle_name: patient.middleName || parts.middleName || null,
    last_name: patient.lastName || parts.lastName || patient.firstName || "Patient",
    sex: patient.sex || ageSexParts[1]?.trim() || "Other",
    birthdate: patient.birthdate || patient.dateOfBirth || patient.birthDate || null,
    contact_number: patient.contactNumber || patient.contact || null,
    street_address: patient.streetAddress || patient.address || null,
    barangay: patient.barangay || patient.patientBarangay || null,
    municipality: patient.municipality || null,
    purok_area: patient.purokArea || patient.purok_area || null,
    civil_status: patient.civilStatus || null,
    occupation: patient.occupation || null,
    philhealth_status: philHealthStatus,
    spouse_name: patient.spouseName || patient.spouse_name || null,
    spouse_occupation:
      patient.spouseOccupation || patient.spouse_occupation || null,
    registration_type:
      patient.registrationType || patient.patientType || patient.patient_type || "general",
    mother_patient_id:
      patient.motherPatientId || patient.mother_patient_id || null,
    mother_name: patient.motherName || patient.mother_name || null,
    father_name: patient.fatherName || patient.father_name || null,
    guardian_name: patient.guardianName || patient.guardian_name || null,
    guardian_relationship:
      patient.guardianRelationship || patient.guardian_relationship || null,
    guardian_contact_number:
      patient.guardianContactNumber ||
      patient.guardianContact ||
      patient.guardian_contact_number ||
      null,
    family_serial_number:
      patient.familySerialNumber || patient.family_serial_number || null,
    birth_place: patient.birthPlace || patient.birth_place || null,
    birth_time: patient.birthTime || patient.birth_time || null,
    birth_weight: patient.birthWeight || patient.birth_weight || null,
    birth_height: patient.birthHeight || patient.birth_height || null,
    nhts_status: patient.nhtsStatus || patient.nhts_status || null,
    philhealth_number: shouldSendPhilHealthNumber
      ? patient.philHealthNumber || patient.philhealthNumber || null
      : null,
    philhealth_category: patient.philHealthCategory || null,
    status: patient.status || undefined,
    barangay_health_center_id: patient.barangayHealthCenterId || patient.bhcId || null,
    rural_health_unit_id: patient.ruralHealthUnitId || patient.rhuId || null,
  };

  const hasCategoryField = ["patientClassification", "patientCategory", "category"].some(
    (key) => Object.prototype.hasOwnProperty.call(patient, key),
  );

  if (hasCategoryField) {
    payload.patient_category =
      patient.patientClassification || patient.patientCategory || patient.category || null;
  }

  // Only sent when the caller actually carries a background, so a plain
  // registration-details edit cannot blank out the clinical background the
  // Medical Background / Family History / Personal & Social tabs own.
  const backgroundSource =
    patient.medicalBackground ?? patient.medical_background;
  if (backgroundSource && typeof backgroundSource === "object") {
    payload.medical_background = normalizeMedicalBackground(backgroundSource);
  }

  return payload;
}

async function listPatients(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ""),
  );
  const response = await apiRequest(`/patients${query.size ? `?${query}` : ""}`);
  return unwrapList(response).map(normalizePatient);
}

export async function getBhcPatients() {
  return listPatients();
}

export async function saveBhcPatients() {
  return getBhcPatients();
}

export async function createBhcPatient(data) {
  const response = await apiRequest("/patients", { method: "POST", body: toPayload(data) });
  return normalizePatient(unwrapData(response));
}

export async function updateBhcPatient(id, data) {
  const response = await apiRequest(`/patients/${id}`, {
    method: "PATCH",
    body: toPayload(data),
  });
  return normalizePatient(unwrapData(response));
}

/**
 * Saves only the clinical background. Deliberately does NOT go through
 * toPayload(): that builder fills in defaults for every registration field
 * ("Patient" for a missing surname, "Other" for a missing sex), which a
 * background-only save must never send. PATCH leaves untouched columns alone.
 */
export async function updatePatientMedicalBackground(id, medicalBackground) {
  const response = await apiRequest(`/patients/${id}`, {
    method: "PATCH",
    body: { medical_background: normalizeMedicalBackground(medicalBackground) },
  });
  return normalizePatient(unwrapData(response));
}

export async function getBhcPatientById(id) {
  const response = await apiRequest(`/patients/${id}`);
  return normalizePatient(unwrapData(response));
}

export async function getRhuPatients() {
  return listPatients();
}

export async function saveRhuPatients() {
  return getRhuPatients();
}

export async function createRhuPatient(data) {
  return createBhcPatient(data);
}

export async function updateRhuPatient(id, data) {
  return updateBhcPatient(id, data);
}

export async function getRhuPatientById(id) {
  return getBhcPatientById(id);
}

export async function getPatientsByRole() {
  return listPatients();
}

export async function getPatientDetailsListByRole(role, params = {}) {
  void role;
  return listPatients(params);
}

export async function getPatientByIdForRole(id) {
  return getBhcPatientById(id);
}

export async function linkReferralPatientToRhu(referral) {
  if (referral?.patient) return normalizePatient(referral.patient);
  return null;
}

export async function getPatients() {
  return getBhcPatients();
}

export async function getPatientDetailsList() {
  return getBhcPatients();
}

export async function getPatientById(patientId) {
  return getBhcPatientById(patientId);
}

export async function savePatient(patientData) {
  return createPatient(patientData);
}

export async function createPatient(patientData) {
  return createBhcPatient(patientData);
}

export async function updatePatient(patientId, patientData) {
  return updateBhcPatient(patientId, patientData);
}

export async function deletePatient(patientId) {
  await apiRequest(`/patients/${patientId}`, { method: "DELETE" });
  return true;
}

export async function getPatientRecords() {
  return getBhcPatients();
}

export async function getPatientHealthRecords(patientId) {
  return getHealthRecordsByPatient({ id: patientId });
}

export async function getPatientReferrals(patientId) {
  return getReferralsByPatient({ id: patientId });
}
