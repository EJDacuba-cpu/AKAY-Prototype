import { apiRequest, unwrapData, unwrapList } from "./apiClient";

function patientNameFrom(hold = {}) {
  const patient = hold.patient || {};
  return (
    patient.full_name ||
    patient.fullName ||
    [patient.first_name, patient.last_name].filter(Boolean).join(" ") ||
    hold.patientName ||
    "Unknown patient"
  );
}

function rhuFrom(hold = {}) {
  return hold.rural_health_unit || hold.ruralHealthUnit || {};
}

/**
 * Waiting referral intents (referral_holds). These are not submitted
 * referrals: no tracking ID or QR until staff explicitly submit.
 */
export function normalizeReferralHold(hold = {}) {
  const rhu = rhuFrom(hold);
  const pending = hold.pending_referral || hold.pendingReferral || {};

  return {
    id: hold.id ? String(hold.id) : "",
    patientId: hold.patient_id ? String(hold.patient_id) : "",
    patientName: patientNameFrom(hold),
    ruralHealthUnitName: rhu.name || hold.ruralHealthUnitName || "",
    ruralHealthUnitId: String(hold.rural_health_unit_id || rhu.id || ""),
    healthRecordId: hold.health_record_id
      ? String(hold.health_record_id)
      : hold.healthRecordId || "",
    urgencyLevel: hold.urgency_level || hold.urgencyLevel || "",
    status: hold.status || "waiting",
    createdAt: hold.created_at || hold.createdAt || "",
    consultationDate: hold.consultation_date || hold.consultationDate || "",
    reasonForReferral:
      hold.reason_for_referral ||
      hold.reasonForReferral ||
      pending.reason_for_referral ||
      "",
    chiefComplaint: hold.chief_complaint || hold.chiefComplaint || "",
    initialDiagnosis: hold.initial_diagnosis || hold.initialDiagnosis || "",
    initialActionTaken:
      hold.initial_action_taken || hold.initialActionTaken || "",
    pendingReferral: pending,
    referralStatus:
      hold.referral_status || hold.referralStatus || "Awaiting Doctor Availability",
    submissionStatus:
      hold.submission_status || hold.submissionStatus || "Not Yet Submitted",
  };
}

export async function getReferralHolds() {
  const response = await apiRequest("/referral-holds");
  return unwrapList(response).map(normalizeReferralHold);
}

export async function getReferralHold(holdId) {
  const response = await apiRequest(`/referral-holds/${holdId}`);
  return normalizeReferralHold(unwrapData(response) || {});
}

export async function getReferralHoldById(holdId) {
  try {
    return await getReferralHold(holdId);
  } catch {
    const holds = await getReferralHolds();
    return holds.find((hold) => String(hold.id) === String(holdId)) || null;
  }
}

export async function discardReferralHold(holdId, reason) {
  const response = await apiRequest(`/referral-holds/${holdId}/discard`, {
    method: "POST",
    body: { reason },
  });
  return unwrapData(response);
}

export default {
  getReferralHolds,
  getReferralHold,
  getReferralHoldById,
  discardReferralHold,
};
