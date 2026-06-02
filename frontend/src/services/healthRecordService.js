import { apiRequest, unwrapData, unwrapList } from "./apiClient";
import { normalizePatient } from "./patientService";

export const BHC_RECORDS_KEY = "api:bhc_health_records";
export const RHU_RECORDS_KEY = "api:rhu_health_records";

function normalizeRecord(record = {}) {
  const vitalSigns = record.vital_signs || record.vitalSigns || {};
  const patient = record.patient ? normalizePatient(record.patient) : null;

  return {
    ...record,
    id: record.id ? String(record.id) : record._id || "",
    _id: record.id ? String(record.id) : record._id || "",
    patientId: record.patient_id ? String(record.patient_id) : record.patientId || "",
    patient,
    patientName: patient?.name || record.patientName || "",
    dateOfVisit:
      record.dateOfVisit ||
      record.date_recorded?.slice?.(0, 10) ||
      record.date_recorded ||
      "",
    timeOfVisit: record.timeOfVisit || "",
    dateRecorded: record.date_recorded || record.dateRecorded || "",
    category: record.category || "",
    chiefComplaint: record.chief_complaint || record.chiefComplaint || "",
    diagnosis: record.diagnosis || "",
    treatmentNotes: record.treatment_notes || record.treatmentNotes || "",
    consultationNotes: record.notes || record.consultationNotes || "",
    medicalHistory: record.medical_history || record.medicalHistory || "",
    systolicBp: vitalSigns.systolicBp || vitalSigns.systolic_bp || record.systolicBp || "",
    diastolicBp: vitalSigns.diastolicBp || vitalSigns.diastolic_bp || record.diastolicBp || "",
    temperature: vitalSigns.temperature || record.temperature || record.temp || "",
    temp: vitalSigns.temperature || record.temperature || record.temp || "",
    pulseRate: vitalSigns.pulseRate || vitalSigns.pulse_rate || record.pulseRate || "",
    pulse: vitalSigns.pulseRate || vitalSigns.pulse_rate || record.pulse || "",
    weight: vitalSigns.weight || record.weight || "",
    height: vitalSigns.height || record.height || "",
    status: record.status || record.followUpStatus || "Routine Monitoring",
    followUpStatus: record.followUpStatus || record.status || "Routine Monitoring",
    createdAt: record.created_at || record.createdAt || "",
    updatedAt: record.updated_at || record.updatedAt || "",
  };
}

function toPayload(record = {}) {
  return {
    patient_id: record.patientId || record.patient_id,
    date_recorded:
      record.dateRecorded ||
      (record.dateOfVisit
        ? `${record.dateOfVisit} ${record.timeOfVisit || "00:00"}`
        : null),
    vital_signs: {
      systolicBp: record.systolicBp || null,
      diastolicBp: record.diastolicBp || null,
      temperature: record.temperature || record.temp || null,
      pulseRate: record.pulseRate || record.pulse || null,
      weight: record.weight || null,
      height: record.height || null,
    },
    category: record.category || record.patientClassification || null,
    chief_complaint: record.chiefComplaint || null,
    diagnosis: record.diagnosis || null,
    treatment_notes: record.treatmentNotes || record.medication || null,
    medical_history: record.medicalHistory || null,
    notes: record.consultationNotes || record.monitoringNotes || null,
  };
}

async function listRecords(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ""),
  );
  const response = await apiRequest(`/health-records${query.size ? `?${query}` : ""}`);
  return unwrapList(response).map(normalizeRecord);
}

export async function getBhcHealthRecords() {
  return listRecords();
}

export async function getRhuHealthRecords() {
  return listRecords();
}

export async function saveBhcHealthRecords(records) {
  if (Array.isArray(records) && records[0]?.patientId) {
    await createHealthRecord(records[0], "bhc");
  }
  return getBhcHealthRecords();
}

export async function saveRhuHealthRecords(records) {
  if (Array.isArray(records) && records[0]?.patientId) {
    await createHealthRecord(records[0], "rhu");
  }
  return getRhuHealthRecords();
}

export async function getHealthRecords(role = "bhc") {
  void role;
  return listRecords();
}

export async function getHealthRecordById(recordId) {
  const response = await apiRequest(`/health-records/${recordId}`);
  return normalizeRecord(unwrapData(response));
}

export async function getHealthRecordsByPatient(patient) {
  const patientId = patient?.id || patient?.patientId || patient;
  return listRecords({ patient_id: patientId });
}

export async function createHealthRecord(recordData, role = "bhc") {
  void role;
  const response = await apiRequest("/health-records", {
    method: "POST",
    body: toPayload(recordData),
  });
  return normalizeRecord(unwrapData(response));
}

export async function createBhcHealthRecord(recordData) {
  return createHealthRecord(recordData, "bhc");
}

export async function createRhuHealthRecord(recordData) {
  return createHealthRecord(recordData, "rhu");
}

export async function createFollowUpHealthRecord(recordData, role = "bhc") {
  return createHealthRecord(recordData, role);
}

export async function updateHealthRecordById(recordId, recordData) {
  const response = await apiRequest(`/health-records/${recordId}`, {
    method: "PATCH",
    body: toPayload(recordData),
  });
  return normalizeRecord(unwrapData(response));
}

export async function updateHealthRecord(recordId, recordData, role = "bhc") {
  void role;
  return updateHealthRecordById(recordId, recordData);
}

export async function deleteHealthRecord(recordId) {
  await apiRequest(`/health-records/${recordId}`, { method: "DELETE" });
  return true;
}

export default {
  getBhcHealthRecords,
  getRhuHealthRecords,
  saveBhcHealthRecords,
  saveRhuHealthRecords,
  getHealthRecords,
  getHealthRecordById,
  getHealthRecordsByPatient,
  createBhcHealthRecord,
  createRhuHealthRecord,
  createHealthRecord,
  createFollowUpHealthRecord,
  updateHealthRecordById,
  updateHealthRecord,
  deleteHealthRecord,
};
