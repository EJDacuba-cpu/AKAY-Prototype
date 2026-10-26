import { readEducation, splitName, toPayload } from "../utils/patientRegistrationPayload";
import { apiRequest, unwrapData, unwrapList } from "./apiClient";
import { getHealthRecordsByPatient } from "./healthRecordService";
import { getReferralsByPatient } from "./referrals";
import { normalizeBackground, normalizeHouseholdEnvironment } from "../utils/backgroundUpdate";
import { parentLinkPayload } from "../utils/parentLinks";


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

/**
 * Patient-level clinical background. Always returns the full shape (all four
 * sections plus revisions, updatedAt and reviewedAt) so the profile can render
 * read-only sections without per-field guards; an older patient row with no
 * background at all, or one still in a pre-ITR string shape, reads as "not yet
 * recorded" rather than crashing. The shaping lives in utils/backgroundUpdate.js
 * so it can be unit tested.
 */
export function normalizeMedicalBackground(source) {
  return normalizeBackground(source);
}

export const EMPTY_MEDICAL_BACKGROUND = normalizeMedicalBackground(null);

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
  const linkedFather =
    patient.father_patient || patient.fatherPatient || patient.father || null;
  const linkedFatherId =
    patient.father_patient_id || patient.fatherPatientId || linkedFather?.id || "";

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
    // Patient Information fields; "" when not recorded (an explicit clear stays cleared).
    ...readEducation(patient),
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
    motherBirthDate: normalizeDate(patient.mother_birth_date || patient.motherBirthDate),
    fatherPatientId: linkedFatherId ? String(linkedFatherId) : "",
    father_patient_id: linkedFatherId ? String(linkedFatherId) : "",
    fatherPatient: linkedFather,
    fatherName: patient.father_name || patient.fatherName || "",
    fatherBirthDate: normalizeDate(patient.father_birth_date || patient.fatherBirthDate),
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
    householdId: patient.household_id == null ? patient.householdId || "" : String(patient.household_id),
    relationshipToHouseholdHead: patient.relationship_to_household_head || patient.relationshipToHouseholdHead || "",
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
    // Another household member's environment, offered as a prefill. Absent on
    // the admin path, where the API omits it.
    householdEnvironment: normalizeHouseholdEnvironment(
      patient.household_environment || patient.householdEnvironment,
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


async function listPatients(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ""),
  );
  const response = await apiRequest(`/patients${query.size ? `?${query}` : ""}`);
  return unwrapList(response).map(normalizePatient);
}

/**
 * The household behind a Family Serial Number: the registered patients the
 * user can see who share it. An empty list means the serial is new.
 */
export async function getHousehold(serial) {
  const query = new URLSearchParams({ serial });
  const response = await apiRequest(`/patients/household?${query}`);
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
 * Saves Patient Background sections outside a consultation (BHC, needs
 * clinical.background.update). `backgroundUpdate` is `{ sections,
 * base_revisions }` (see utils/backgroundEditing sectionSavePayload). Resolves
 * to the normalized patient - the same shape as getBhcPatientById, so it can
 * replace the patient-details cache. Rejects with status 422 (field errors) or
 * 409 (PATIENT_BACKGROUND_CONFLICT with `payload.conflicts`).
 */
export async function savePatientBackground(id, backgroundUpdate) {
  const response = await apiRequest(`/patients/${id}/background`, {
    method: "PATCH",
    body: { background_update: backgroundUpdate },
  });
  return normalizePatient(unwrapData(response));
}

/**
 * The Patient Background tab's Changes log: what each finalized consultation
 * changed in the background (and each standalone Patient Background save,
 * source "patient_background", without a health record), newest first.
 */
export async function getPatientBackgroundHistory(id) {
  const response = await apiRequest(`/patients/${id}/background-history`);
  return Array.isArray(unwrapData(response)) ? unwrapData(response) : [];
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

// Parent changes must never pass through the full registration serializer.
export async function updatePatientParent(patientId, role, parentId, previousId) {
  const response = await apiRequest(`/patients/${patientId}`, {
    method: 'PATCH', body: parentLinkPayload(role, parentId, previousId),
  });
  return normalizePatient(unwrapData(response));
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
