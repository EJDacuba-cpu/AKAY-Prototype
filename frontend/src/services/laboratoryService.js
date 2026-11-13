import { apiRequest, unwrapData } from "./apiClient";

export const getLaboratoryTests = (recordId) => apiRequest(`/health-records/${recordId}/laboratory-tests`);
export const getPatientLaboratoryTests = async (patientId) => unwrapData(await apiRequest(`/laboratory-evidence/patients/${patientId}`));
export const getMonitoringLaboratoryEvidence = async (patientId) => unwrapData(await apiRequest(`/laboratory-evidence/monitoring/${patientId}`));
export const getLaboratoryHandoffs = async (recordId) => unwrapData(await apiRequest(`/health-records/${recordId}/laboratory-tests/handoffs`));

export function laboratoryEntryPayload(entry) {
  const payload = Object.fromEntries(["id", "testName", "collectionDate", "examinationDate", "resultStatus", "result"].map(key => [key, entry[key] ?? ""]));
  if ("resultSource" in entry) payload.resultSource = entry.resultSource ?? "";
  if ("remarks" in entry) payload.remarks = entry.remarks ?? "";
  return payload;
}

export const saveLaboratoryAddendum = (recordId, entry, reason) => apiRequest(`/health-records/${recordId}/laboratory-tests/${entry.recordId}/addenda`, {
  method: "POST", body: { tests: [laboratoryEntryPayload(entry)], reason, version: entry.version },
});
export const shareLaboratoryEvidence = (handoffId, selected, reason, sharingRevision) => apiRequest(`/laboratory-evidence/handoffs/${handoffId}/share`, {
  method: "POST", body: { selected, confirmed: true, reason, sharingRevision },
});
