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
    civilStatus: patient.civil_status || patient.civilStatus || "",
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
    civil_status: patient.civilStatus || null,
    philhealth_number: patient.philHealthNumber || patient.philhealthNumber || null,
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

export async function getPatientDetailsListByRole(role) {
  void role;
  return listPatients();
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
