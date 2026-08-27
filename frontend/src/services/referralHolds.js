import { apiRequest, unwrapData, unwrapList } from "./apiClient";

/**
 * DOC-14 blocked-submission holds (referral_holds). A hold is intent only -
 * enough to prefill the referral form on resume - never a clinical payload.
 */
function normalizeReferralHold(hold = {}) {
  const patient = hold.patient || {};
  const rhu = hold.rural_health_unit || hold.ruralHealthUnit || {};

  return {
    id: hold.id ? String(hold.id) : "",
    patientId: hold.patient_id ? String(hold.patient_id) : "",
    patientName:
      patient.full_name ||
      patient.fullName ||
      [patient.first_name, patient.last_name].filter(Boolean).join(" ") ||
      hold.patientName ||
      "Unknown patient",
    ruralHealthUnitName: rhu.name || hold.ruralHealthUnitName || "",
    healthRecordId: hold.health_record_id
      ? String(hold.health_record_id)
      : hold.healthRecordId || "",
    urgencyLevel: hold.urgency_level || hold.urgencyLevel || "",
    preferredProviderId: hold.preferred_provider_id
      ? String(hold.preferred_provider_id)
      : hold.preferredProviderId || "",
    status: hold.status || "waiting",
    createdAt: hold.created_at || hold.createdAt || "",
  };
}

export async function getReferralHolds() {
  const response = await apiRequest("/referral-holds");
  return unwrapList(response).map(normalizeReferralHold);
}

export async function getReferralHoldById(holdId) {
  const holds = await getReferralHolds();
  return holds.find((hold) => String(hold.id) === String(holdId)) || null;
}

export async function discardReferralHold(holdId) {
  const response = await apiRequest(`/referral-holds/${holdId}/discard`, {
    method: "POST",
  });
  return unwrapData(response);
}

export default {
  getReferralHolds,
  getReferralHoldById,
  discardReferralHold,
};
