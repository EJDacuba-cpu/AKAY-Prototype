import { apiRequest, unwrapData } from "./apiClient";

export const getTbRegistration = async recordId => unwrapData(await apiRequest(`/health-records/${recordId}/tb-registration`));
export const registerTbCase = async attempt => unwrapData(await apiRequest(`/health-records/${attempt.sourceId}/tb-registration`, {
  method: "POST", headers: { "Idempotency-Key": attempt.key }, body: attempt.payload,
}));

export const getTbCase = async id => unwrapData(await apiRequest(`/tb-cases/${id}`));
export const getTbMonitoring = async (caseId, page = 1) => unwrapData(await apiRequest(`/tb-cases/${caseId}/monitoring?page=${page}`));
export const getTbMonitoringEntry = async (caseId, entryId) => unwrapData(await apiRequest(`/tb-cases/${caseId}/monitoring/${entryId}`));
export const saveTbMonitoring = async attempt => unwrapData(await apiRequest(`/tb-cases/${attempt.caseId}/monitoring${attempt.entryId ? `/${attempt.entryId}` : ""}`, {
  method: attempt.entryId ? "PATCH" : "POST", headers: { "Idempotency-Key": attempt.key }, body: attempt.payload,
}));
export const getPatientTbCases = async (patientId, page = 1) => unwrapData(await apiRequest(`/patients/${patientId}/tb-cases?page=${page}`));
export const getTbCaseEndorsements = async caseId => unwrapData(await apiRequest(`/tb-cases/${caseId}/endorsements`));
export const createTbEndorsement = async attempt => unwrapData(await apiRequest(`/tb-cases/${attempt.sourceId}/endorsements`, {
  method: "POST", headers: { "Idempotency-Key": attempt.key }, body: attempt.payload,
}));
export const getTbEndorsements = async (page = 1, caseId = "") => unwrapData(await apiRequest(`/tb-endorsements?${new URLSearchParams({ page, ...(caseId ? { case_id: caseId } : {}) })}`));
export const getTbEndorsement = async id => unwrapData(await apiRequest(`/tb-endorsements/${id}`));
export const actOnTbEndorsement = async (id, action, payload) => unwrapData(await apiRequest(`/tb-endorsements/${id}/${action}`, { method: "POST", body: payload }));

export async function downloadTbCasePdf(caseId) {
  const blob = await apiRequest(`/tb-cases/${caseId}/pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `DS-TB-Treatment-Card-${caseId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
