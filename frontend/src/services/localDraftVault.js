/**
 * On-device vault for an interrupted consultation.
 *
 * SCOPE: AKAY remains ONLINE-FIRST. This vault holds exactly one encrypted
 * snapshot per (authenticated user, consultation) so a consultation that is
 * already open survives a connection loss, refresh, tab close, or PC restart.
 * It is not an offline cache: no patient search, inventory, referral, or report
 * data is ever written here.
 *
 * Plaintext columns carry no PHI and no account id - only SHA-256 tags, a
 * timestamp, and the AES-GCM IV. Everything clinical lives in `ciphertext`,
 * sealed with a non-extractable key held in the same database (see
 * `localDraftCrypto.js`). Destroying the key store makes every residual
 * ciphertext permanently unreadable, which is what session cleanup does.
 */

import {
  createVaultKey,
  decryptRecord,
  deriveTag,
  encryptRecord,
  isCryptoAvailable,
} from "./localDraftCrypto";

const DB_NAME = "akay-consultation-vault";
const DB_VERSION = 1;
const DRAFT_STORE = "drafts";
const KEY_STORE = "vault-keys";
const OWNER_INDEX = "by-owner";

const DRAFT_TAG_NAMESPACE = "akay-local-draft";
const OWNER_TAG_NAMESPACE = "akay-local-draft-owner";

/**
 * A local snapshot is a short-lived safety net, not storage. Anything older
 * than this is swept on the next open so PHI does not linger on a shared
 * workstation after the consultation has been abandoned.
 */
export const LOCAL_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getIndexedDb() {
  return typeof globalThis !== "undefined" && globalThis.indexedDB
    ? globalThis.indexedDB
    : null;
}

/**
 * False when this browser context cannot store drafts securely (no IndexedDB,
 * or no Web Crypto because the page is served over an insecure origin). The
 * caller must then keep the draft in memory only and say so truthfully.
 */
export function isLocalDraftVaultAvailable() {
  return Boolean(getIndexedDb()) && isCryptoAvailable();
}

let databasePromise = null;

function openDatabase() {
  const indexedDb = getIndexedDb();
  if (!indexedDb) return Promise.reject(new Error("IndexedDB is unavailable."));

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DRAFT_STORE)) {
          const store = database.createObjectStore(DRAFT_STORE, {
            keyPath: "recordKey",
          });
          store.createIndex(OWNER_INDEX, "ownerTag", { unique: false });
        }
        if (!database.objectStoreNames.contains(KEY_STORE)) {
          database.createObjectStore(KEY_STORE, { keyPath: "ownerTag" });
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        // A version change from another tab invalidates this handle.
        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Draft vault is blocked."));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

function runTransaction(storeNames, mode, work) {
  return openDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(storeNames, mode);
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);

        try {
          work(transaction, (value) => {
            result = value;
          });
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      }),
  );
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getOwnerTags(ownerKey) {
  const owner = String(ownerKey || "");
  if (!owner) throw new Error("A local draft needs an owner.");
  return { owner, ownerTag: await deriveTag(OWNER_TAG_NAMESPACE, owner) };
}

async function getRecordKey(ownerKey, consultationKey) {
  const consultation = String(consultationKey || "");
  if (!consultation) throw new Error("A local draft needs a consultation key.");
  return deriveTag(DRAFT_TAG_NAMESPACE, String(ownerKey || ""), consultation);
}

/**
 * The owner's AES-GCM key, created on first use. The key never leaves the
 * browser's key store: only a non-extractable handle is persisted.
 */
async function getOrCreateOwnerKey(ownerTag) {
  const database = await openDatabase();
  const existing = await new Promise((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE, "readonly");
    const request = transaction.objectStore(KEY_STORE).get(ownerTag);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (existing?.key) return existing.key;

  const key = await createVaultKey();
  await runTransaction(KEY_STORE, "readwrite", (transaction) => {
    transaction.objectStore(KEY_STORE).put({
      ownerTag,
      key,
      createdAt: new Date().toISOString(),
    });
  });
  return key;
}

/**
 * Write (or overwrite) the single snapshot for this consultation. Only the
 * latest version is kept - the same consultation never accumulates rows.
 *
 * @returns {Promise<string>} the ISO timestamp stored with the snapshot.
 */
export async function saveLocalDraft({ ownerKey, consultationKey, record }) {
  const { ownerTag } = await getOwnerTags(ownerKey);
  const recordKey = await getRecordKey(ownerKey, consultationKey);
  const key = await getOrCreateOwnerKey(ownerTag);
  const savedAt = new Date().toISOString();
  const { iv, ciphertext } = await encryptRecord(key, recordKey, {
    consultationKey: String(consultationKey),
    savedAt,
    record,
  });

  await runTransaction(DRAFT_STORE, "readwrite", (transaction) => {
    transaction
      .objectStore(DRAFT_STORE)
      .put({ recordKey, ownerTag, savedAt, iv, ciphertext });
  });

  return savedAt;
}

async function decryptRow(key, row) {
  try {
    const opened = await decryptRecord(key, row.recordKey, row);
    return {
      consultationKey: opened.consultationKey || "",
      savedAt: opened.savedAt || row.savedAt || "",
      record: opened.record ?? null,
    };
  } catch {
    // Unreadable (rotated key, corrupt row, tampered AAD): drop it rather than
    // surfacing partial clinical data.
    await deleteByRecordKey(row.recordKey).catch(() => {});
    return null;
  }
}

async function deleteByRecordKey(recordKey) {
  return runTransaction(DRAFT_STORE, "readwrite", (transaction) => {
    transaction.objectStore(DRAFT_STORE).delete(recordKey);
  });
}

/** The snapshot for one consultation, or null. */
export async function readLocalDraft({ ownerKey, consultationKey }) {
  const { ownerTag } = await getOwnerTags(ownerKey);
  const recordKey = await getRecordKey(ownerKey, consultationKey);
  const database = await openDatabase();
  const row = await requestToPromise(
    database.transaction(DRAFT_STORE, "readonly").objectStore(DRAFT_STORE).get(recordKey),
  );

  if (!row || row.ownerTag !== ownerTag) return null;
  const key = await getOrCreateOwnerKey(ownerTag);
  return decryptRow(key, row);
}

/**
 * Every snapshot belonging to this user, newest first. Rows past
 * `LOCAL_DRAFT_MAX_AGE_MS` are deleted instead of returned.
 */
export async function listLocalDrafts(ownerKey) {
  const { ownerTag } = await getOwnerTags(ownerKey);
  const database = await openDatabase();
  const rows = await requestToPromise(
    database
      .transaction(DRAFT_STORE, "readonly")
      .objectStore(DRAFT_STORE)
      .index(OWNER_INDEX)
      .getAll(ownerTag),
  );

  if (!rows?.length) return [];

  const cutoff = Date.now() - LOCAL_DRAFT_MAX_AGE_MS;
  const fresh = [];
  for (const row of rows) {
    const savedTime = new Date(row.savedAt || 0).getTime();
    if (!Number.isFinite(savedTime) || savedTime < cutoff) {
      await deleteByRecordKey(row.recordKey).catch(() => {});
      continue;
    }
    fresh.push(row);
  }
  if (!fresh.length) return [];

  const key = await getOrCreateOwnerKey(ownerTag);
  const opened = await Promise.all(fresh.map((row) => decryptRow(key, row)));
  return opened
    .filter(Boolean)
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

/**
 * Remove one snapshot. Call this only once the server has CONFIRMED the draft
 * was saved - never because a request failed.
 */
export async function deleteLocalDraft({ ownerKey, consultationKey }) {
  const recordKey = await getRecordKey(ownerKey, consultationKey);
  return deleteByRecordKey(recordKey);
}

/**
 * Wipe every snapshot AND every key. Destroying the keys makes any ciphertext
 * that survives elsewhere (a backup, an unflushed page) permanently unreadable.
 * Used by session cleanup on logout, account switch, and forced invalidation.
 */
export async function purgeLocalDraftVault() {
  if (!getIndexedDb()) return false;
  try {
    await runTransaction([DRAFT_STORE, KEY_STORE], "readwrite", (transaction) => {
      transaction.objectStore(DRAFT_STORE).clear();
      transaction.objectStore(KEY_STORE).clear();
    });
    return true;
  } catch {
    // A vault that cannot be opened holds nothing this session can read.
    return false;
  }
}
