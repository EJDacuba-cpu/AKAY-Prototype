import { apiRequest, unwrapData } from "./apiClient";

export const getTbCaseFollowUp = async caseId => unwrapData(await apiRequest(`/tb-cases/${caseId}/follow-up`));
export const saveTbCaseFollowUp = async attempt => unwrapData(await apiRequest(`/tb-cases/${attempt.caseId}/${attempt.action === "lab"
  ? `follow-up-labs${attempt.labId ? `/${attempt.labId}` : ""}` : attempt.action}`, {
  method: attempt.action === "lab" && attempt.labId ? "PATCH" : "POST", headers: { "Idempotency-Key": attempt.key }, body: attempt.payload,
}));
