const DRAFT_STORAGE_KEY = "akay_offline_drafts";

function readDrafts() {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDrafts(drafts) {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
}

function createDraftId(moduleType) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const random = Math.random().toString(36).slice(2, 8);
  return `${moduleType}-${timestamp}-${random}`;
}

export function saveOfflineDraft({
  moduleType,
  formData,
  status = "local_draft",
  id = "",
  metadata = {},
}) {
  const now = new Date().toISOString();
  const drafts = readDrafts();
  const existingDraft = id
    ? drafts.find((draft) => draft.id === id || draft.localDraftId === id)
    : null;
  const draftId = existingDraft?.id || id || createDraftId(moduleType);
  const draft = {
    ...(existingDraft || {}),
    ...metadata,
    id: draftId,
    localDraftId: metadata.localDraftId || existingDraft?.localDraftId || draftId,
    moduleType,
    formData,
    createdAt: existingDraft?.createdAt || metadata.createdAt || now,
    updatedAt: now,
    status,
  };

  writeDrafts([
    draft,
    ...drafts.filter(
      (item) => item.id !== draftId && item.localDraftId !== draftId,
    ),
  ]);
  return draft;
}

export function getOfflineDrafts(moduleType = "") {
  const drafts = readDrafts();
  return moduleType
    ? drafts.filter((draft) => draft.moduleType === moduleType)
    : drafts;
}

export function updateOfflineDraftStatus(id, status) {
  const drafts = readDrafts();
  const nextDrafts = drafts.map((draft) =>
    draft.id === id || draft.localDraftId === id
      ? { ...draft, status, updatedAt: new Date().toISOString() }
      : draft,
  );
  writeDrafts(nextDrafts);
}

export function deleteOfflineDraft(localDraftId) {
  const drafts = readDrafts();
  writeDrafts(
    drafts.filter(
      (draft) =>
        draft.id !== localDraftId && draft.localDraftId !== localDraftId,
    ),
  );
}

export function saveHealthRecordDraft({
  localDraftId = "",
  patientId = "",
  patientName = "",
  serviceType = "",
  visitDate = "",
  formData = {},
  userId = "",
  role = "",
  facility = "",
  label = "",
  mode = "create",
  recordId = "",
  source = "add_health_record",
  status = "local_draft",
}) {
  return saveOfflineDraft({
    id: localDraftId,
    moduleType: "health_record",
    formData,
    status,
    metadata: {
      draftType: "health_record",
      source,
      patientId,
      patientName,
      serviceType,
      visitDate,
      userId,
      role,
      facility,
      label,
      mode,
      recordId,
    },
  });
}

export function listHealthRecordDrafts({
  role = "",
  userId = "",
  patientId = "",
  serviceType = "",
} = {}) {
  return readDrafts().filter((draft) => {
    if (draft.moduleType !== "health_record") return false;
    if (draft.status === "synced" || draft.status === "discarded") return false;
    if (role && draft.role && draft.role !== role) return false;
    if (userId && draft.userId && String(draft.userId) !== String(userId)) {
      return false;
    }
    if (
      patientId &&
      String(draft.patientId || draft.formData?.selectedPatientId || "") !==
        String(patientId)
    ) {
      return false;
    }
    if (
      serviceType &&
      draft.serviceType &&
      String(draft.serviceType) !== String(serviceType)
    ) {
      return false;
    }
    return true;
  });
}

export async function deleteHealthRecordDraft(localDraftId) {
  deleteOfflineDraft(localDraftId);
}

export function createClientSubmissionId() {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveReferralDraft({
  role = "",
  userId = "",
  patientId = "",
  healthRecordId = "",
  payload = {},
  errorMessage = "",
}) {
  const draft = saveOfflineDraft({
    moduleType: "referral",
    formData: payload,
    status: "pending_sync",
  });
  const clientSubmissionId =
    payload.clientSubmissionId ||
    payload.client_submission_id ||
    createClientSubmissionId();
  const referralDraft = {
    ...draft,
    localDraftId: draft.id,
    role,
    userId,
    patientId,
    healthRecordId,
    payload: {
      ...payload,
      clientSubmissionId,
    },
    clientSubmissionId,
    errorMessage,
  };

  const drafts = readDrafts();
  writeDrafts(
    drafts.map((item) => (item.id === draft.id ? referralDraft : item)),
  );
  return referralDraft;
}

export async function listReferralDrafts({ role = "", userId = "" } = {}) {
  return readDrafts().filter((draft) => {
    if (draft.moduleType !== "referral") return false;
    if (role && draft.role && draft.role !== role) return false;
    if (userId && draft.userId && draft.userId !== userId) return false;
    return draft.status !== "synced";
  });
}

export async function updateReferralDraft(localDraftId, updates = {}) {
  const drafts = readDrafts();
  let updatedDraft = null;
  const nextDrafts = drafts.map((draft) => {
    if (draft.id !== localDraftId && draft.localDraftId !== localDraftId) {
      return draft;
    }

    updatedDraft = {
      ...draft,
      ...updates,
      localDraftId: draft.localDraftId || draft.id,
      updatedAt: new Date().toISOString(),
      status: updates.status || draft.status || "pending_sync",
    };
    return updatedDraft;
  });

  writeDrafts(nextDrafts);
  return updatedDraft;
}

export async function deleteReferralDraft(localDraftId) {
  deleteOfflineDraft(localDraftId);
}
