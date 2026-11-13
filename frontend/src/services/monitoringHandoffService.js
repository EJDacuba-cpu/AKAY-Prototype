import { apiRequest, unwrapData, unwrapList } from "./apiClient";

export async function listMonitoringHandoffRequests() {
  return unwrapList(await apiRequest("/monitoring-handoff-requests")) || [];
}

export async function getMonitoringHandoffRequest(id) {
  return unwrapData(await apiRequest(`/monitoring-handoff-requests/${id}`));
}

export async function linkMonitoringHandoffRequest(id, linkedPatientId, {
  identityConfirmed = false,
  verificationEvidence = "",
} = {}) {
  const body = { linked_patient_id: Number(linkedPatientId) };
  if (identityConfirmed) {
    body.identity_confirmed = true;
  }
  const evidence = String(verificationEvidence || "").trim();
  if (evidence) {
    body.verification_evidence = evidence;
  }
  return unwrapData(await apiRequest(`/monitoring-handoff-requests/${id}/link`, {
    method: "POST",
    body,
  }));
}

export async function registerMonitoringHandoffSource(id) {
  return unwrapData(await apiRequest(`/monitoring-handoff-requests/${id}/register-source`, {
    method: "POST",
  }));
}

export async function flagMonitoringHandoffIdentityReview(id, note) {
  return unwrapData(await apiRequest(`/monitoring-handoff-requests/${id}/flag-identity-review`, {
    method: "POST",
    body: { note: String(note || "").trim() },
  }));
}

export async function resolveMonitoringHandoffIdentityReview(id, note) {
  return unwrapData(await apiRequest(`/monitoring-handoff-requests/${id}/resolve-identity-review`, {
    method: "POST",
    body: { note: String(note || "").trim() },
  }));
}

export async function correctMonitoringHandoffIdentityLink(id, note) {
  return unwrapData(await apiRequest(`/monitoring-handoff-requests/${id}/correct-identity-link`, {
    method: "POST",
    body: { note: String(note || "").trim() },
  }));
}

export async function getPatientRhuSharedClinical(patientId) {
  return unwrapList(await apiRequest(`/patients/${patientId}/rhu-shared-clinical`)) || [];
}

export async function acceptMonitoringHandoffRequest(id) {
  return unwrapData(await apiRequest(`/monitoring-handoff-requests/${id}/accept`, { method: "POST" }));
}

export async function declineMonitoringHandoffRequest(id, { reason } = {}) {
  return unwrapData(await apiRequest(`/monitoring-handoff-requests/${id}/decline`, {
    method: "POST",
    body: { reason },
  }));
}

export async function searchBhcPatients(query) {
  const response = await apiRequest(`/patients?search=${encodeURIComponent(query || "")}&per_page=10`);
  const page = unwrapData(response) || response?.data || {};
  return page.data || page || [];
}
