const DB_NAME = "akay_offline_drafts";
const DB_VERSION = 1;
const STORE_NAME = "drafts";
export const REFERRAL_DRAFT_TYPE = "referral_draft";

function openDraftDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "localDraftId",
        });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("userScope", "userScope", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runDraftTransaction(mode, operation) {
  return openDraftDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = operation(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      }),
  );
}

export function getDraftScope({ userId = "", role = "" } = {}) {
  return `${role || "unknown"}:${userId || "anonymous"}`;
}

export function createClientSubmissionId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function getPayloadClientSubmissionId(payload = {}) {
  return payload.clientSubmissionId || payload.client_submission_id || "";
}

export async function saveReferralDraft({
  userId,
  role,
  patientId,
  healthRecordId,
  payload,
  errorMessage = "",
}) {
  const now = new Date().toISOString();
  const clientSubmissionId =
    getPayloadClientSubmissionId(payload) || createClientSubmissionId();
  const payloadWithClientSubmissionId = {
    ...payload,
    clientSubmissionId,
  };
  const draft = {
    localDraftId:
      globalThis.crypto?.randomUUID?.() ||
      `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: REFERRAL_DRAFT_TYPE,
    userId: userId || "",
    role: role || "",
    userScope: getDraftScope({ userId, role }),
    patientId: patientId || "",
    healthRecordId: healthRecordId || "",
    clientSubmissionId,
    payload: payloadWithClientSubmissionId,
    createdAt: now,
    updatedAt: now,
    status: "pending_sync",
    errorMessage,
  };

  await runDraftTransaction("readwrite", (store) => store.put(draft));
  return draft;
}

export async function updateReferralDraft(localDraftId, changes = {}) {
  const draft = await getReferralDraft(localDraftId);
  if (!draft) return null;

  const updated = {
    ...draft,
    ...changes,
    updatedAt: new Date().toISOString(),
  };
  await runDraftTransaction("readwrite", (store) => store.put(updated));
  return updated;
}

export async function getReferralDraft(localDraftId) {
  return runDraftTransaction("readonly", (store) => store.get(localDraftId));
}

export async function deleteReferralDraft(localDraftId) {
  await runDraftTransaction("readwrite", (store) => store.delete(localDraftId));
}

export async function listReferralDrafts(scope = {}) {
  const userScope = getDraftScope(scope);
  const drafts = await runDraftTransaction("readonly", (store) => store.getAll());
  return drafts.filter(
    (draft) =>
      draft.type === REFERRAL_DRAFT_TYPE &&
      draft.status === "pending_sync" &&
      draft.userScope === userScope,
  );
}
