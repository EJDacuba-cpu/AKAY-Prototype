import { apiRequest, unwrapData } from "./apiClient";

export const getLaboratoryTests = (recordId) => apiRequest(`/health-records/${recordId}/laboratory-tests`);
export const getPatientLaboratoryTests = async (patientId) => unwrapData(await apiRequest(`/laboratory-evidence/patients/${patientId}`));
export const getMonitoringLaboratoryEvidence = async (patientId) => unwrapData(await apiRequest(`/laboratory-evidence/monitoring/${patientId}`));
export const getLaboratoryHandoffs = async (recordId) => unwrapData(await apiRequest(`/health-records/${recordId}/laboratory-tests/handoffs`));

export function laboratoryEntryPayload(entry) {
  return Object.fromEntries(["id", "testName", "collectionDate", "examinationDate", "resultStatus", "result"].map(key => [key, entry[key] ?? ""]));
}

export const saveLaboratoryAddendum = (recordId, entry, reason) => apiRequest(`/health-records/${recordId}/laboratory-tests/${entry.recordId}/addenda`, {
  method: "POST", body: { tests: [laboratoryEntryPayload(entry)], reason, version: entry.version },
});
export const shareLaboratoryEvidence = (handoffId, selected, reason, sharingRevision) => apiRequest(`/laboratory-evidence/handoffs/${handoffId}/share`, {
  method: "POST", body: { selected, confirmed: true, reason, sharingRevision },
});

export function attachmentContext({ patientId, visitId, consultationUuid, testId, recordId, handoffId } = {}) {
  if (handoffId) return { handoff_id: handoffId };
  if (recordId) return { health_record_id: recordId, test_client_id: testId };
  return { patient_id: patientId, rhu_visit_id: visitId, consultation_uuid: consultationUuid, test_client_id: testId };
}

export const getLaboratoryAttachments = (context) => apiRequest(`/laboratory-attachments?${new URLSearchParams(attachmentContext(context))}`);
export async function uploadLaboratoryAttachment(context, file, reason = "", replaceAttachmentId = "") {
  const body = new FormData();
  Object.entries(attachmentContext(context)).forEach(([key, value]) => body.append(key, value));
  body.append("file", file);
  if (reason) body.append("reason", reason);
  if (replaceAttachmentId) body.append("replace_attachment_id", replaceAttachmentId);
  return unwrapData(await apiRequest("/laboratory-attachments", { method: "POST", body }));
}
export const removeLaboratoryAttachment = (id, context, reason = "") => apiRequest(`/laboratory-attachments/${id}`, {
  method: "DELETE", body: { ...attachmentContext(context), reason },
});
export const previewLaboratoryAttachment = (id, context) => apiRequest(`/laboratory-attachments/${id}?${new URLSearchParams(attachmentContext(context))}`, { responseType: "blob" });
