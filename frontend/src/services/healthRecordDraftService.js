import { apiRequest, unwrapData, unwrapList } from "./apiClient";

function normalizeDraft(draft = {}) {
  return {
    id: String(draft.id || ""),
    patient: {
      id: draft.patient?.id ? String(draft.patient.id) : "",
      label: draft.patient?.label || "Patient",
    },
    classification: draft.classification || "",
    version: Number(draft.version || 0),
    lastSavedAt: draft.last_saved_at || "",
    expiresAt: draft.expires_at || "",
    payload: draft.payload || null,
    medicineSelections: Array.isArray(draft.medicine_selections)
      ? draft.medicine_selections
      : [],
  };
}

export async function listHealthRecordDrafts() {
  const drafts = [];
  let page = 1;

  while (true) {
    const response = await apiRequest(
      `/health-record-drafts?per_page=15&page=${page}`,
    );
    drafts.push(...unwrapList(response).map(normalizeDraft));
    const lastPage = Math.max(1, Number(response?.data?.last_page || 1));
    if (page >= lastPage) break;
    page += 1;
  }

  return drafts;
}

export async function createHealthRecordDraft({
  patientId,
  classification,
  payload,
}) {
  const response = await apiRequest("/health-record-drafts", {
    method: "POST",
    body: {
      patient_id: patientId,
      classification,
      payload,
    },
  });
  return normalizeDraft(unwrapData(response));
}

export async function getHealthRecordDraft(draftId) {
  const response = await apiRequest(`/health-record-drafts/${draftId}`);
  return normalizeDraft(unwrapData(response));
}

export async function updateHealthRecordDraft(
  draftId,
  { patientId, classification, payload, version },
) {
  const response = await apiRequest(`/health-record-drafts/${draftId}`, {
    method: "PUT",
    body: {
      patient_id: patientId,
      classification,
      payload,
      version,
    },
  });
  return normalizeDraft(unwrapData(response));
}

export async function discardHealthRecordDraft(draftId) {
  await apiRequest(`/health-record-drafts/${draftId}`, { method: "DELETE" });
}
