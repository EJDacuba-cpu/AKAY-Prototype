import { apiRequest, unwrapData, unwrapList } from "./apiClient";
import { normalizePatient } from "./patientService";

export const BHC_RECORDS_KEY = "api:bhc_health_records";
export const RHU_RECORDS_KEY = "api:rhu_health_records";

function firstPresent(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

function normalizeSupplementsGiven(record = {}, maternalData = {}) {
  const supplements =
    record.supplementsGiven ||
    record.supplements_given ||
    maternalData.supplementsGiven ||
    maternalData.supplements_given ||
    [];

  if (!Array.isArray(supplements)) return [];

  return supplements.map((item = {}) => ({
    ...item,
    supplementType: item.supplementType || item.supplement_type || "",
    supplement_type: item.supplement_type || item.supplementType || "",
    supplementName: item.supplementName || item.supplement_name || "",
    supplement_name: item.supplement_name || item.supplementName || "",
    quantity: item.quantity || "",
    unit: item.unit || "",
    dateGiven: item.dateGiven || item.date_given || "",
    date_given: item.date_given || item.dateGiven || "",
    remarks: item.remarks || item.notes || "",
    givenById: item.givenById || item.given_by_id || "",
    given_by_id: item.given_by_id || item.givenById || "",
    givenByName: item.givenByName || item.given_by_name || "",
    given_by_name: item.given_by_name || item.givenByName || "",
  }));
}

function normalizeRecord(record = {}) {
  const vitalSigns = record.vital_signs || record.vitalSigns || {};
  const patient = record.patient ? normalizePatient(record.patient) : null;
  const maternalData = record.maternal_data || record.maternalData || {};
  const supplementsGiven = normalizeSupplementsGiven(record, maternalData);
  const normalizedMaternalData = {
    ...maternalData,
    supplements_given: supplementsGiven,
    supplementsGiven,
  };
  const immunizationData = record.immunization_data || record.immunizationData || {};
  const monitoringData = record.monitoring_data || record.monitoringData || {};
  const parentHealthRecordId =
    record.parent_health_record_id ||
    record.parentHealthRecordId ||
    record.original_health_record_id ||
    record.originalHealthRecordId ||
    monitoringData.parentHealthRecordId ||
    monitoringData.parent_health_record_id ||
    monitoringData.previousRecordId ||
    record.previousRecordId ||
    "";
  const normalizedVisitType =
    record.visit_type ||
    record.visitType ||
    monitoringData.visitType ||
    monitoringData.visit_type ||
    (parentHealthRecordId || monitoringData.isFollowUp || record.isFollowUp
      ? "follow_up_visit"
      : "initial_consultation");
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
    visitType: normalizedVisitType,
    visit_type: normalizedVisitType,
    parentHealthRecordId: parentHealthRecordId ? String(parentHealthRecordId) : "",
    parent_health_record_id: parentHealthRecordId || null,
    category: record.category || "",
    patientClassification: record.category || record.patientClassification || "",
    chiefComplaint: record.chief_complaint || record.chiefComplaint || "",
    diagnosis: record.diagnosis || "",
    treatmentNotes: record.treatment_notes || record.treatmentNotes || "",
    medication: record.treatment_notes || record.treatmentNotes || record.medication || "",
    initialActionsTaken:
      record.initialActionsTaken ||
      record.initial_actions_taken ||
      record.treatment_notes ||
      record.treatmentNotes ||
      record.medication ||
      "",
    summaryOfPresentIllness: firstPresent([
      record.summaryOfPresentIllness,
      record.summary_of_present_illness,
      record.physicalExamination,
      record.physical_examination,
      record.medical_history,
      record.medicalHistory,
      record.notes,
    ]),
    physicalExamination:
      record.physicalExamination || record.physical_examination || "",
    consultationNotes: record.notes || record.consultationNotes || "",
    medicalHistory: record.medical_history || record.medicalHistory || "",
    attendingStaff:
      record.attendingStaff ||
      record.attending_staff ||
      monitoringData.attendingStaff ||
      monitoringData.attending_staff ||
      monitoringData.nameOfPractitioner ||
      monitoringData.name_of_practitioner ||
      record.nameOfPractitioner ||
      record.name_of_practitioner ||
      record.recordedBy ||
      record.recorded_by ||
      "",
    recordedBy:
      record.recordedBy ||
      record.recorded_by ||
      record.creator?.name ||
      record.created_by_user?.name ||
      record.createdByUser?.name ||
      record.user?.name ||
      record.attendingStaff ||
      record.attending_staff ||
      "",
    createdBy:
      record.createdBy ||
      record.created_by ||
      record.created_by_user ||
      record.createdByUser ||
      record.creator ||
      record.user ||
      null,
    vitalSigns:
      record.vitalSigns ||
      record.vital_signs?.summary ||
      record.vital_signs ||
      "",
    vital_signs: record.vital_signs || record.vitalSigns || null,
    maternalData: normalizedMaternalData,
    maternal_data: normalizedMaternalData,
    supplementsGiven,
    supplements_given: supplementsGiven,
    lmp: normalizedMaternalData.lmp || record.lmp || "",
    pmp: normalizedMaternalData.pmp || record.pmp || "",
    cycleDuration: normalizedMaternalData.cycleDuration || record.cycleDuration || "",
    gravida: normalizedMaternalData.gravida || record.gravida || "",
    para: normalizedMaternalData.para || record.para || "",
    term: normalizedMaternalData.term || record.term || "",
    preterm: normalizedMaternalData.preterm || record.preterm || "",
    abortion: normalizedMaternalData.abortion || record.abortion || "",
    living: normalizedMaternalData.living || record.living || "",
    tpal: normalizedMaternalData.tpal || record.tpal || "",
    expectedDeliveryDate:
      normalizedMaternalData.expectedDeliveryDate ||
      normalizedMaternalData.expected_delivery_date ||
      record.expectedDeliveryDate ||
      "",
    aog: normalizedMaternalData.aog || record.aog || "",
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
      monitoringData.follow_up_status ||
      monitoringData.status ||
      record.followUpStatus ||
      record.follow_up_status ||
      "Routine Monitoring",
    followUpStatus:
      record.followUpStatus ||
      record.follow_up_status ||
      monitoringData.followUpStatus ||
      monitoringData.follow_up_status ||
      monitoringData.status ||
      record.status ||
      "Routine Monitoring",
    followUpDate:
      monitoringData.followUpDate ||
      monitoringData.follow_up_date ||
      record.followUpDate ||
      record.follow_up_date ||
      "",
    monitoringNotes:
      monitoringData.monitoringNotes ||
      monitoringData.monitoring_notes ||
      record.monitoringNotes ||
      record.monitoring_notes ||
      "",
    patientCondition:
      monitoringData.patientCondition ||
      monitoringData.patient_condition ||
      record.patientCondition ||
      record.patient_condition ||
      "",
    linkedTrackingId: monitoringData.linkedTrackingId || record.linkedTrackingId || "",
    referralTrackingId: monitoringData.referralTrackingId || record.referralTrackingId || "",
    previousRecordId: parentHealthRecordId || monitoringData.previousRecordId || record.previousRecordId || "",
    isFollowUp:
      Boolean(record.isFollowUp || record.is_follow_up || monitoringData.isFollowUp) ||
      normalizedVisitType === "follow_up_visit",
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
  const parentHealthRecordId =
    record.parentHealthRecordId ||
    record.parent_health_record_id ||
    record.originalHealthRecordId ||
    record.original_health_record_id ||
    record.previousRecordId ||
    null;
  const visitType =
    record.visitType ||
    record.visit_type ||
    (record.isFollowUp || parentHealthRecordId ? "follow_up_visit" : "initial_consultation");
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
  maternalData.supplements_given = normalizeSupplementsGiven(
    record,
    maternalData,
  ).map((item) => ({
    supplement_type: item.supplement_type,
    supplement_name: item.supplement_name,
    quantity: item.quantity,
    unit: item.unit,
    date_given: item.date_given,
    remarks: item.remarks || "",
    given_by_id: item.given_by_id || null,
    given_by_name: item.given_by_name || "",
  }));
  const monitoringData = {
    ...(record.monitoringData || record.monitoring_data || {}),
    followUpStatus: record.followUpStatus || record.status || null,
    followUpDate: record.followUpDate || null,
    monitoringNotes: record.monitoringNotes || null,
    patientCondition: record.patientCondition || null,
    attendingStaff: record.attendingStaff || record.nameOfPractitioner || null,
    referralAssessmentStatus: record.referralAssessmentStatus || null,
    linkedTrackingId: record.linkedTrackingId || null,
    referralTrackingId: record.referralTrackingId || null,
    previousRecordId: parentHealthRecordId,
    parentHealthRecordId,
    visitType,
    isFollowUp: record.isFollowUp || visitType === "follow_up_visit",
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
      summary:
        typeof record.vitalSigns === "string"
          ? record.vitalSigns
          : record.vitalSigns?.summary || null,
      systolicBp: record.systolicBp || null,
      diastolicBp: record.diastolicBp || null,
      temperature: record.temperature || record.temp || null,
      pulseRate: record.pulseRate || record.pulse || null,
      weight: record.weight || null,
      height: record.height || null,
    },
    visit_type: visitType,
    parent_health_record_id: parentHealthRecordId,
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
    treatment_notes:
      record.treatmentNotes ||
      record.medication ||
      record.initialActionsTaken ||
      record.initialActionTaken ||
      null,
    medical_history:
      record.medicalHistory ||
      record.summaryOfPresentIllness ||
      record.physicalExamination ||
      null,
    notes:
      record.consultationNotes ||
      record.summaryOfPresentIllness ||
      record.monitoringNotes ||
      null,
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
  if (!hasAny(record, ["visitType", "visit_type", "isFollowUp", "parentHealthRecordId", "parent_health_record_id", "previousRecordId"])) {
    delete payload.visit_type;
  }
  if (!hasAny(record, ["parentHealthRecordId", "parent_health_record_id", "originalHealthRecordId", "original_health_record_id", "previousRecordId", "isFollowUp"])) {
    delete payload.parent_health_record_id;
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
      "attendingStaff",
      "nameOfPractitioner",
      "referralAssessmentStatus",
      "linkedTrackingId",
      "referralTrackingId",
      "previousRecordId",
      "parentHealthRecordId",
      "parent_health_record_id",
      "visitType",
      "visit_type",
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
  if (
    !hasAny(record, [
      "treatmentNotes",
      "medication",
      "initialActionsTaken",
      "initialActionTaken",
    ])
  ) {
    delete payload.treatment_notes;
  }
  if (
    !hasAny(record, [
      "medicalHistory",
      "summaryOfPresentIllness",
      "physicalExamination",
    ])
  ) {
    delete payload.medical_history;
  }
  if (
    !hasAny(record, [
      "consultationNotes",
      "summaryOfPresentIllness",
      "monitoringNotes",
    ])
  ) {
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
