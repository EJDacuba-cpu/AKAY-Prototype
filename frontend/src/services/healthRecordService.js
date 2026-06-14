import { apiRequest, unwrapData, unwrapList } from "./apiClient";
import { normalizePatient } from "./patientService";

export const BHC_RECORDS_KEY = "api:bhc_health_records";
export const RHU_RECORDS_KEY = "api:rhu_health_records";

function normalizeRecord(record = {}) {
  const vitalSigns = record.vital_signs || record.vitalSigns || {};
  const patient = record.patient ? normalizePatient(record.patient) : null;
  const maternalData = record.maternal_data || record.maternalData || {};
  const immunizationData = record.immunization_data || record.immunizationData || {};
  const monitoringData = record.monitoring_data || record.monitoringData || {};
  const needsReferral =
    record.needs_referral === true || record.needsReferral === true || record.needsReferral === "yes"
      ? "yes"
      : "no";

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
    patientClassification: record.category || record.patientClassification || "",
    chiefComplaint: record.chief_complaint || record.chiefComplaint || "",
    diagnosis: record.diagnosis || "",
    treatmentNotes: record.treatment_notes || record.treatmentNotes || "",
    consultationNotes: record.notes || record.consultationNotes || "",
    medicalHistory: record.medical_history || record.medicalHistory || "",
    maternalData,
    maternal_data: maternalData,
    lmp: maternalData.lmp || record.lmp || "",
    pmp: maternalData.pmp || record.pmp || "",
    cycleDuration: maternalData.cycleDuration || record.cycleDuration || "",
    gravida: maternalData.gravida || record.gravida || "",
    para: maternalData.para || record.para || "",
    term: maternalData.term || record.term || "",
    preterm: maternalData.preterm || record.preterm || "",
    abortion: maternalData.abortion || record.abortion || "",
    living: maternalData.living || record.living || "",
    tpal: maternalData.tpal || record.tpal || "",
    expectedDeliveryDate:
      maternalData.expectedDeliveryDate ||
      maternalData.expected_delivery_date ||
      record.expectedDeliveryDate ||
      "",
    aog: maternalData.aog || record.aog || "",
    immunizationData,
    immunization_data: immunizationData,
    monitoringData,
    monitoring_data: monitoringData,
    needsReferral,
    needs_referral: record.needs_referral,
    systolicBp: vitalSigns.systolicBp || vitalSigns.systolic_bp || record.systolicBp || "",
    diastolicBp: vitalSigns.diastolicBp || vitalSigns.diastolic_bp || record.diastolicBp || "",
    temperature: vitalSigns.temperature || record.temperature || record.temp || "",
    temp: vitalSigns.temperature || record.temperature || record.temp || "",
    pulseRate: vitalSigns.pulseRate || vitalSigns.pulse_rate || record.pulseRate || "",
    pulse: vitalSigns.pulseRate || vitalSigns.pulse_rate || record.pulse || "",
    weight: vitalSigns.weight || record.weight || "",
    height: vitalSigns.height || record.height || "",
    status:
      record.status ||
      monitoringData.followUpStatus ||
      monitoringData.status ||
      record.followUpStatus ||
      "Routine Monitoring",
    followUpStatus:
      record.followUpStatus ||
      monitoringData.followUpStatus ||
      monitoringData.status ||
      record.status ||
      "Routine Monitoring",
    followUpDate: monitoringData.followUpDate || record.followUpDate || "",
    monitoringNotes: monitoringData.monitoringNotes || record.monitoringNotes || "",
    patientCondition: monitoringData.patientCondition || record.patientCondition || "",
    linkedTrackingId: monitoringData.linkedTrackingId || record.linkedTrackingId || "",
    referralTrackingId: monitoringData.referralTrackingId || record.referralTrackingId || "",
    previousRecordId: monitoringData.previousRecordId || record.previousRecordId || "",
    createdAt: record.created_at || record.createdAt || "",
    updatedAt: record.updated_at || record.updatedAt || "",
  };
}

function hasAny(record = {}, keys = []) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function toPayload(record = {}, { partial = false } = {}) {
  const category = record.category || record.recordType || record.patientClassification || null;
  const recordTypeKey = String(category || "").toLowerCase();
  const maternalData = {
    ...(record.maternalData || record.maternal_data || {}),
    lmp: record.lmp || record.LMP || null,
    pmp: record.pmp || null,
    cycleDuration: record.cycleDuration || null,
    gravida: record.gravida || null,
    para: record.para || null,
    term: record.term || null,
    preterm: record.preterm || null,
    abortion: record.abortion || null,
    living: record.living || null,
    tpal: record.tpal || null,
    expectedDeliveryDate: record.expectedDeliveryDate || null,
    aog: record.aog || null,
  };
  const monitoringData = {
    ...(record.monitoringData || record.monitoring_data || {}),
    followUpStatus: record.followUpStatus || record.status || null,
    followUpDate: record.followUpDate || null,
    monitoringNotes: record.monitoringNotes || null,
    patientCondition: record.patientCondition || null,
    referralAssessmentStatus: record.referralAssessmentStatus || null,
    linkedTrackingId: record.linkedTrackingId || null,
    referralTrackingId: record.referralTrackingId || null,
    previousRecordId: record.previousRecordId || null,
    isFollowUp: record.isFollowUp || false,
  };
  const needsReferral =
    record.needsReferral === true ||
    record.needsReferral === "yes" ||
    record.needs_referral === true;

  const payload = {
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
    category,
    maternal_data: recordTypeKey === "maternal" ? maternalData : null,
    immunization_data:
      recordTypeKey === "immunization"
        ? record.immunizationData || record.immunization_data || {}
        : null,
    monitoring_data: monitoringData,
    needs_referral: needsReferral,
    chief_complaint: record.chiefComplaint || null,
    diagnosis: record.diagnosis || null,
    treatment_notes: record.treatmentNotes || record.medication || null,
    medical_history: record.medicalHistory || null,
    notes: record.consultationNotes || record.monitoringNotes || null,
  };

  if (!partial) return payload;

  if (!hasAny(record, ["patientId", "patient_id"])) delete payload.patient_id;
  if (!hasAny(record, ["dateRecorded", "dateOfVisit", "timeOfVisit"])) {
    delete payload.date_recorded;
  }
  if (
    !hasAny(record, [
      "systolicBp",
      "diastolicBp",
      "temperature",
      "temp",
      "pulseRate",
      "pulse",
      "weight",
      "height",
      "vitalSigns",
      "vital_signs",
    ])
  ) {
    delete payload.vital_signs;
  }
  if (!hasAny(record, ["category", "recordType", "patientClassification"])) {
    delete payload.category;
    delete payload.maternal_data;
    delete payload.immunization_data;
  }
  if (
    !hasAny(record, [
      "monitoringData",
      "monitoring_data",
      "followUpStatus",
      "status",
      "followUpDate",
      "monitoringNotes",
      "patientCondition",
      "referralAssessmentStatus",
      "linkedTrackingId",
      "referralTrackingId",
      "previousRecordId",
      "isFollowUp",
    ])
  ) {
    delete payload.monitoring_data;
  }
  if (!hasAny(record, ["needsReferral", "needs_referral"])) {
    delete payload.needs_referral;
  }
  if (!hasAny(record, ["chiefComplaint"])) delete payload.chief_complaint;
  if (!hasAny(record, ["diagnosis"])) delete payload.diagnosis;
  if (!hasAny(record, ["treatmentNotes", "medication"])) {
    delete payload.treatment_notes;
  }
  if (!hasAny(record, ["medicalHistory"])) delete payload.medical_history;
  if (!hasAny(record, ["consultationNotes", "monitoringNotes"])) {
    delete payload.notes;
  }

  return payload;
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
    body: toPayload(recordData, { partial: true }),
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
