import { apiRequest, unwrapData, unwrapList } from "./apiClient";
import { clinicalDraftRequest } from "../utils/clinicalDraftRequest";

function normalizeDraft(draft = {}) {
  return {
    reviewState: draft.review_state || "encoding",
    canEdit: draft.can_edit !== false,
    editor: draft.editor || null,
    editorExpiresAt: draft.editor_expires_at || "",
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

export async function listHealthRecordDrafts({ draftOwnerContext } = {}) {
  const drafts = [];
  let page = 1;

  while (true) {
    const response = await apiRequest(
      `/health-record-drafts?per_page=15&page=${page}`,
      draftOwnerContext ? { draftOwnerContext } : {},
    );
    drafts.push(...unwrapList(response).map(normalizeDraft));
    const lastPage = Math.max(1, Number(response?.data?.last_page || 1));
    if (page >= lastPage) break;
    page += 1;
  }

  return drafts;
}

export async function lookupHealthRecordDraft({ patientId, rhuVisitId, draftOwnerContext }) {
  const query = new URLSearchParams({ patient_id: String(patientId), ...(rhuVisitId ? { rhu_visit_id: String(rhuVisitId) } : {}) });
  const response = await apiRequest(`/health-record-drafts/lookup?${query}`, draftOwnerContext ? { draftOwnerContext } : {});
  return response?.data ? normalizeDraft(response.data) : null;
}

export async function createHealthRecordDraft({
  patientId,
  classification,
  consultationUuid,
  rhuVisitId,
  payload,
  draftOwnerContext,
}) {
  const response = await apiRequest("/health-record-drafts", {
    method: "POST",
    ...(draftOwnerContext ? { draftOwnerContext } : {}),
    body: clinicalDraftRequest({ patientId, classification, consultationUuid, rhuVisitId, payload }),
  });
  return normalizeDraft(unwrapData(response));
}

export async function getHealthRecordDraft(draftId, { claim = true, draftOwnerContext } = {}) {
  const options = draftOwnerContext ? { draftOwnerContext } : {};
  const response = await apiRequest(`/health-record-drafts/${draftId}`, options);
  const draft = normalizeDraft(unwrapData(response));
  if (!draft.canEdit || !claim) return draft;
  const claimed = await transitionDraft(draftId, "claim", draft.version, undefined, options);
  return { ...draft, ...claimed, payload: draft.payload, medicineSelections: draft.medicineSelections };
}

export async function transitionDraft(draftId, action, version, note, options = {}) {
  const response = await apiRequest(`/health-record-drafts/${draftId}/transition`, { ...options, method: "POST", body: { action, version, note } });
  return normalizeDraft(unwrapData(response));
}

export async function updateHealthRecordDraft(
  draftId,
  { patientId, classification, consultationUuid, rhuVisitId, payload, version, draftOwnerContext },
) {
  const response = await apiRequest(`/health-record-drafts/${draftId}`, {
    method: "PUT",
    ...(draftOwnerContext ? { draftOwnerContext } : {}),
    body: clinicalDraftRequest({ patientId, classification, consultationUuid, rhuVisitId, payload, version }),
  });
  return normalizeDraft(unwrapData(response));
}

export async function discardHealthRecordDraft(draftId, version, options = {}) {
  await apiRequest(`/health-record-drafts/${draftId}`, { ...options, method: "DELETE", ...(version !== undefined ? { body: { version } } : {}) });
}
