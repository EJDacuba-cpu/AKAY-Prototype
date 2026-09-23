import { apiRequest, unwrapData, unwrapList } from "./apiClient";

function normalizeDraft(draft = {}) {
  return {
    reviewState: draft.review_state || "encoding",
    editor: draft.editor || null,
    returnNote: draft.return_note || "",
    id: String(draft.id || ""),
    // Identity of the CONSULTATION (not the draft). Null for drafts created
    // before it existed; those fall back to id/patient matching.
    consultationUuid: draft.consultation_uuid
      ? String(draft.consultation_uuid).toLowerCase()
      : "",
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
  consultationUuid,
  payload,
}) {
  const response = await apiRequest("/health-record-drafts", {
    method: "POST",
    body: {
      patient_id: patientId,
      classification,
      consultation_uuid: consultationUuid || null,
      payload,
    },
  });
  return normalizeDraft(unwrapData(response));
}

export async function getHealthRecordDraft(draftId) {
  const response = await apiRequest(`/health-record-drafts/${draftId}`);
  const draft = normalizeDraft(unwrapData(response));
  const claimed = await transitionDraft(draftId, "claim", draft.version);
  return { ...draft, ...claimed, payload: draft.payload, medicineSelections: draft.medicineSelections };
}

export async function transitionDraft(draftId, action, version, note) {
  const response = await apiRequest(`/health-record-drafts/${draftId}/transition`, { method: "POST", body: { action, version, note } });
  return normalizeDraft(unwrapData(response));
}

export async function updateHealthRecordDraft(
  draftId,
  { patientId, classification, consultationUuid, payload, version },
) {
  const response = await apiRequest(`/health-record-drafts/${draftId}`, {
    method: "PUT",
    body: {
      patient_id: patientId,
      classification,
      // Adopted server-side only by a draft that has none yet; an identity
      // that is already set is never reassigned.
      consultation_uuid: consultationUuid || null,
      payload,
      version,
    },
  });
  return normalizeDraft(unwrapData(response));
}

export async function discardHealthRecordDraft(draftId) {
  await apiRequest(`/health-record-drafts/${draftId}`, { method: "DELETE" });
}
