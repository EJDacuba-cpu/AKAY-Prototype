import { apiRequest } from "./apiClient";

/** Active visits in today's RHU queue, oldest first. Pass includeClosed for reporting. */
export async function listRhuVisits({ includeClosed = false } = {}) {
  const path = includeClosed ? "/rhu-visits?include_closed=1" : "/rhu-visits";
  const response = await apiRequest(path);
  return response?.data ?? [];
}

/** One visit in today's queue, including an in-consultation identity after start. */
export async function getRhuVisit(visitId) {
  const response = await apiRequest(`/rhu-visits/${visitId}`);
  return response?.data ?? null;
}

/** Patients this RHU may check in, found by name tokens, PhilHealth or contact number. */
export async function searchPatientsForCheckIn(query) {
  const response = await apiRequest(`/rhu-visits/patient-search?q=${encodeURIComponent(query)}`);
  return response?.data ?? [];
}

/** Newest walk-in-eligible patients for the check-in desk preview (identity only). */
export async function listRecentPatientsForCheckIn(limit = 8) {
  const response = await apiRequest(`/rhu-visits/recent-patients?limit=${encodeURIComponent(limit)}`);
  return response?.data ?? [];
}

/**
 * Pending BHC referrals for one visit-check-in-eligible patient at this RHU.
 * Identity only. Does not change referral status or create a visit.
 */
export async function listPendingReferralsForCheckIn(patientId) {
  const response = await apiRequest(
    `/rhu-visits/patients/${encodeURIComponent(patientId)}/pending-referrals`,
  );
  const data = response?.data && typeof response.data === "object" ? response.data : {};
  const referrals = Array.isArray(data.referrals) ? data.referrals : [];
  const count = Number(data.count);
  return {
    count: Number.isFinite(count) ? count : referrals.length,
    referrals,
  };
}

/**
 * Active RHU follow-ups for Visit Check-in. Desk metadata only.
 * Does not fulfill, cancel, or assign follow-up tasks.
 */
export async function listPendingFollowUpsForCheckIn(patientId) {
  const response = await apiRequest(
    `/rhu-visits/patients/${encodeURIComponent(patientId)}/pending-follow-ups`,
  );
  const data = response?.data && typeof response.data === "object" ? response.data : {};
  const followUps = Array.isArray(data.follow_ups) ? data.follow_ups : [];
  const count = Number(data.count);
  return {
    count: Number.isFinite(count) ? count : followUps.length,
    follow_ups: followUps,
  };
}

/** Check an existing patient into today's RHU queue as a walk-in. */
export async function checkInExistingPatient(patientId, checkInKey) {
  const response = await apiRequest("/rhu-visits", {
    method: "POST",
    body: { patient_id: Number(patientId), check_in_key: checkInKey },
  });
  return response?.data ?? null;
}

/** Close a waiting visit with an audited reason. Never opens a clinical editor. */
export async function closeRhuVisit(visitId, { reason, note } = {}) {
  const response = await apiRequest(`/rhu-visits/${visitId}/close`, {
    method: "POST",
    body: { reason, note: note || undefined },
  });
  return response?.data ?? null;
}

/** Start or resume the visit's consultation identity. Does not create a draft. */
export async function startRhuVisit(visitId, { followUpTaskIds, entryConsultationUuid } = {}) {
  const response = await apiRequest(`/rhu-visits/${visitId}/start`, {
    method: "POST",
    body: { follow_up_task_ids: Array.isArray(followUpTaskIds) ? followUpTaskIds : [], ...(entryConsultationUuid ? { entry_consultation_uuid: entryConsultationUuid } : {}) },
  });
  return response?.data ?? null;
}

/** Catchment BHCs of the signed-in RHU (Manage to BHC destinations). */
export async function listCatchmentBhcs() {
  const response = await apiRequest("/rhu/catchment-bhcs");
  return response?.data ?? [];
}

export async function resumeRhuVisit(visitId) {
  const response = await apiRequest(`/rhu-visits/${visitId}/resume`, { method: "POST" });
  return response?.data ?? null;
}
