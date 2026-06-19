import { apiRequest, unwrapData, unwrapList } from "./apiClient";

export function normalizeReferralStatus(status) {
  const raw = String(status || "Pending").trim().toLowerCase();
  if (raw.includes("receive")) return "Received";
  if (raw.includes("show")) return "No-Show";
  if (raw.includes("complete")) return "Completed";
  if (raw.includes("monitor")) return "For Monitoring";
  return "Pending";
}

function normalizeReferral(referral = {}) {
  const patient = referral.patient || {};
  const healthRecord = referral.health_record || referral.healthRecord || {};
  const bhc = referral.barangay_health_center || referral.barangayHealthCenter || {};
  const rhu = referral.rural_health_unit || referral.ruralHealthUnit || {};

  return {
    ...referral,
    id: referral.id ? String(referral.id) : "",
    trackingId: referral.tracking_id || referral.trackingId || "",
    qrCodeValue: referral.qr_code_value || referral.qrCodeValue || "",
    clientSubmissionId:
      referral.client_submission_id || referral.clientSubmissionId || "",
    patientId: referral.patient_id ? String(referral.patient_id) : referral.patientId || "",
    healthRecordId: referral.health_record_id
      ? String(referral.health_record_id)
      : healthRecord.id
        ? String(healthRecord.id)
        : referral.healthRecordId || referral.recordId || "",
    healthRecord,
    patient,
    patientName:
      patient.full_name ||
      patient.fullName ||
      patient.name ||
      referral.patientName ||
      referral.patient_name ||
      [patient.first_name, patient.middle_name, patient.last_name]
        .filter(Boolean)
        .join(" "),
    patientContact:
      patient.contact_number ||
      patient.contactNumber ||
      patient.contact ||
      referral.patient_contact ||
      referral.patientContact ||
      referral.contactNumber ||
      referral.contact ||
      "",
    ageSex:
      referral.ageSex ||
      referral.age_sex ||
      patient.ageSex ||
      [patient.age || referral.age, patient.sex || referral.sex]
        .filter(Boolean)
        .join(" / "),
    birthDate:
      referral.birthDate ||
      referral.birth_date ||
      patient.birthDate ||
      patient.birth_date ||
      "",
    address:
      referral.patientAddress ||
      referral.patient_address ||
      patient.address ||
      patient.streetAddress ||
      [patient.street_address, patient.barangay, patient.municipality]
        .filter(Boolean)
        .join(", "),
    barangay: referral.barangay || referral.patientBarangay || patient.barangay || "",
    referringHci: bhc.name || referral.referringHci || "",
    receivingFacility: rhu.name || referral.receivingFacility || "",
    barangayHealthCenterId: referral.barangay_health_center_id || bhc.id || "",
    ruralHealthUnitId: referral.rural_health_unit_id || rhu.id || "",
    category: referral.referral_category || referral.category || "",
    referralCategory: referral.referral_category || referral.referralCategory || "",
    urgencyLevel: referral.urgency_level || referral.urgencyLevel || "Normal",
    priority: referral.urgency_level || referral.priority || "Normal",
    reasonForReferral: referral.reason_for_referral || referral.reasonForReferral || "",
    chiefComplaint: referral.chief_complaint || referral.chiefComplaint || "",
    initialDiagnosis: referral.initial_diagnosis || referral.initialDiagnosis || "",
    initialActionsTaken: referral.initial_action_taken || referral.initialActionsTaken || "",
    referringPractitioner:
      referral.referring_practitioner || referral.referringPractitioner || "",
    referralDateTime: referral.referral_datetime || referral.referralDateTime || "",
    date: referral.referral_datetime?.slice?.(0, 10) || referral.date || "",
    status: normalizeReferralStatus(referral.status),
    feedback: referral.feedback || null,
    statusHistory: referral.updates || referral.statusHistory || [],
    createdAt: referral.created_at || referral.createdAt || "",
    updatedAt: referral.updated_at || referral.updatedAt || "",
  };
}

function toPayload(referral = {}) {
  return {
    client_submission_id:
      referral.clientSubmissionId || referral.client_submission_id || null,
    patient_id: referral.patientId || referral.patient_id,
    health_record_id:
      referral.healthRecordId || referral.health_record_id || referral.recordId || null,
    barangay_health_center_id: referral.barangayHealthCenterId || referral.bhcId || null,
    rural_health_unit_id: referral.ruralHealthUnitId || referral.rhuId || referral.rhu_id,
    referral_category: referral.referralCategory || referral.category || null,
    urgency_level: normalizeUrgencyLevel(referral.urgencyLevel || referral.priority),
    reason_for_referral: referral.reasonForReferral || referral.reason || "",
    chief_complaint: referral.chiefComplaint || null,
    initial_diagnosis: referral.initialDiagnosis || referral.diagnosis || null,
    initial_action_taken:
      referral.initialActionsTaken || referral.initialActionTaken || referral.medication || null,
    referring_practitioner: referral.referringPractitioner || null,
    referral_datetime:
      referral.referralDateTime ||
      (referral.referralDate
        ? `${referral.referralDate} ${referral.referralTime || "00:00"}`
        : null),
    remarks: referral.remarks || null,
  };
}

function normalizeUrgencyLevel(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("emergency")) return "Emergency";
  if (normalized.includes("urgent")) return "Urgent";
  if (normalized.includes("low")) return "Low";
  return "Normal";
}

async function listReferrals(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ""),
  );
  const response = await apiRequest(`/referrals${query.size ? `?${query}` : ""}`);
  return unwrapList(response).map(normalizeReferral);
}

async function listIncomingReferrals(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ""),
  );
  const response = await apiRequest(`/incoming-referrals${query.size ? `?${query}` : ""}`);
  return unwrapList(response).map(normalizeReferral);
}

export function saveReferrals(referrals) {
  return Array.isArray(referrals) ? referrals.map(normalizeReferral) : [];
}

export async function getReferrals() {
  return listReferrals();
}

export async function getIncomingReferrals(params = {}) {
  return listIncomingReferrals(params);
}

export async function getReferralById(referralId) {
  const response = await apiRequest(`/referrals/${referralId}`);
  return normalizeReferral(unwrapData(response));
}

export async function getReferralByTrackingId(trackingId) {
  const response = await apiRequest(`/tracking/${encodeURIComponent(trackingId)}`);
  return normalizeReferral(unwrapData(response));
}

export async function getReferralByRouteParam(routeParam) {
  const decoded = decodeURIComponent(String(routeParam || "").trim());
  if (!decoded) return null;

  if (/^\d+$/.test(decoded)) {
    return getReferralById(decoded);
  }

  return getReferralByTrackingId(decoded);
}

export async function getReferralsByPatient(patient) {
  const patientId = patient?.id || patient?.patientId || patient;
  const referrals = await listReferrals();
  return referrals.filter((referral) => String(referral.patientId) === String(patientId));
}

export async function hasActiveReferralForPatient(patient) {
  const referrals = await getReferralsByPatient(patient);
  return referrals.some((referral) =>
    ["Pending", "Received", "For Monitoring"].includes(referral.status),
  );
}

export async function getReferralByHealthRecordId(recordId) {
  const referrals = await listReferrals();
  return referrals.find((referral) => String(referral.healthRecordId) === String(recordId)) || null;
}

export async function createReferral(referralData) {
  const response = await apiRequest("/referrals", {
    method: "POST",
    body: toPayload(referralData),
  });
  return normalizeReferral(unwrapData(response));
}

export async function updateReferralStatus(referralId, status, changes = {}) {
  const response = await apiRequest(`/referrals/${referralId}/status`, {
    method: "PATCH",
    body: { status: normalizeReferralStatus(status), remarks: changes.remarks || null },
  });
  return normalizeReferral(unwrapData(response));
}

export async function updateReferralByTrackingId(trackingId, changes) {
  const referral = await getReferralByTrackingId(trackingId);
  const nextChanges = typeof changes === "function" ? changes(referral) : changes;

  if (nextChanges?.status) {
    return updateReferralStatus(referral.id, nextChanges.status, nextChanges);
  }

  return referral;
}

export async function submitReturnSlip(trackingId, feedbackData = {}) {
  const referral = await getReferralByTrackingId(trackingId);
  const response = await apiRequest("/feedback", {
    method: "POST",
    body: {
      referral_id: referral.id,
      received_at: feedbackData.receivedAt || feedbackData.received_at || null,
      rhu_diagnosis:
        feedbackData.rhuDiagnosis || feedbackData.diagnosis || feedbackData.rhu_diagnosis || "RHU feedback submitted",
      action_taken: feedbackData.actionTaken || feedbackData.action_taken || null,
      treatment_notes:
        feedbackData.treatmentNotes || feedbackData.treatment_management_notes || null,
      recommendation: feedbackData.recommendation || null,
      receiving_practitioner:
        feedbackData.receivingPractitioner || feedbackData.receiving_practitioner || null,
      remarks: feedbackData.remarks || null,
    },
  });

  return normalizeReferral(unwrapData(response)?.referral || { ...referral, status: "Completed" });
}

export async function autoMarkNoShowReferrals() {
  return getReferrals();
}

export default {
  getReferrals,
  getIncomingReferrals,
  getReferralById,
  getReferralByTrackingId,
  getReferralByRouteParam,
  getReferralsByPatient,
  hasActiveReferralForPatient,
  getReferralByHealthRecordId,
  createReferral,
  updateReferralStatus,
  updateReferralByTrackingId,
  submitReturnSlip,
  autoMarkNoShowReferrals,
  saveReferrals,
};
