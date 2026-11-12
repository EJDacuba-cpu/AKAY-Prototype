import { apiRequest, unwrapData, unwrapList } from "./apiClient";

export async function listMonitoringHandoffRequests() {
  return unwrapList(await apiRequest("/monitoring-handoff-requests")) || [];
}

export async function getMonitoringHandoffRequest(id) {
  return unwrapData(await apiRequest(`/monitoring-handoff-requests/${id}`));
}

export async function linkMonitoringHandoffRequest(id, linkedPatientId) {
  return unwrapData(await apiRequest(`/monitoring-handoff-requests/${id}/link`, {
    method: "POST",
    body: { linked_patient_id: Number(linkedPatientId) },
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
