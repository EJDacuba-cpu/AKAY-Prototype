import { decryptRecord, deriveTag, encryptRecord, getSubtleCrypto } from "./localDraftCrypto.js";

const DAY = 86400000;
let databasePromise;
const failure = (code, message) => Object.assign(new Error(message), { code });

function database() {
  if (!globalThis.indexedDB || !getSubtleCrypto()) {
    return Promise.reject(failure("DRAFT_STORAGE_UNAVAILABLE", "Secure recovery storage is unavailable in this browser."));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("akay-form-recovery", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "slot" });
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(failure("DRAFT_STORAGE_UNAVAILABLE", "Close other AKAY tabs to enable recovery storage."));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); databasePromise = undefined; };
        // Sweep all expired envelopes on open, including abandoned forms and
        // accounts that have not signed in again. No decryption is needed.
        const tx = db.transaction("drafts", "readwrite");
        const cursor = tx.objectStore("drafts").openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          if (Date.parse(row.value.expiresAt) <= Date.now()) row.delete();
          row.continue();
        };
        tx.oncomplete = () => resolve(db);
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || failure("DRAFT_STORAGE_UNAVAILABLE", "Recovery cleanup failed.")); };
      };
    }).catch((error) => { databasePromise = undefined; throw error; });
  }
  return databasePromise;
}

const indexedDbStore = {
  async all() {
    const db = await database();
    return new Promise((resolve, reject) => {
      const request = db.transaction("drafts", "readonly").objectStore("drafts").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async get(slot) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", "readonly");
      const request = tx.objectStore("drafts").get(slot);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },
  async change(slot, mutate) {
    const db = await database();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction("drafts", "readwrite", { durability: "strict" }); }
      catch { tx = db.transaction("drafts", "readwrite"); }
      let result;
      let error;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(error || tx.error || failure("DRAFT_STORAGE_UNAVAILABLE", "Recovery checkpoint failed."));
      tx.onerror = () => { /* onabort reports the failed durable transaction */ };
      const store = tx.objectStore("drafts");
      const read = store.get(slot);
      read.onsuccess = () => {
        try { result = mutate(read.result || null); if (result) store.put(result); }
        catch (cause) { error = cause; tx.abort(); }
      };
    });
  },
};

export function formDraftSlot({ owner, formType, mode, contextKey }) {
  return deriveTag("akay-form-recovery-v1", owner, formType, mode, contextKey);
}

export const formDraftOwnerTag = (owner) => deriveTag("akay-form-recovery-owner", owner);

export async function importRecoveryKey(material) {
  const bytes = Uint8Array.from(atob(material), (value) => value.charCodeAt(0));
  if (bytes.byteLength !== 32 || !getSubtleCrypto()) {
    throw failure("DRAFT_STORAGE_UNAVAILABLE", "A secure recovery key could not be opened.");
  }
  return getSubtleCrypto().importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function createFormDraftVault({ store = indexedDbStore, now = Date.now } = {}) {
  return {
    inspect: (slot) => store.get(slot),
    async sweepExpired() {
      for (const row of await store.all()) {
        if (!row || Date.parse(row.expiresAt) > now()) continue;
        await store.change(row.slot, (current) => {
          if (!current || Date.parse(current.expiresAt) > now()) return current;
          return { ...current, terminal: true, ciphertext: null, iv: null, unsynced: false };
        });
      }
    },
    async rowsForOwner(ownerTag) {
      return (await store.all()).filter((row) => row && row.ownerTag === ownerTag && !row.terminal && !row.reserved && Date.parse(row.expiresAt) > now());
    },
    reserve(slot, transactionUuid, adopt = false, ownerTag) {
      return store.change(slot, (current) => {
        if (current && !current.terminal && Date.parse(current.expiresAt) > now()) {
          if (!adopt || !current.reserved || current.transactionUuid === transactionUuid) return current;
        }
        return {
          slot, transactionUuid, ownerTag: ownerTag || current?.ownerTag, revision: current ? current.revision + 1 : 0,
          reserved: true, terminal: false, iv: null, ciphertext: null,
          expiresAt: new Date(now() + 7 * DAY).toISOString(),
        };
      });
    },
    async open(slot, key) {
      const row = await store.get(slot);
      if (!row || row.terminal || now() >= Date.parse(row.expiresAt)) {
        throw failure("DRAFT_RECOVERY_EXPIRED", "This device recovery copy is no longer available.");
      }
      return decryptRecord(key, `${slot}:${row.transactionUuid}`, row);
    },
    async write({ slot, key, descriptor, transactionUuid, expectedRevision = 0, snapshot, ownerTag, unsynced = true }) {
      const expiry = Math.min(Date.parse(descriptor.expires_at), now() + 7 * DAY);
      if (!Number.isFinite(expiry) || expiry <= now()) {
        throw failure("DRAFT_RECOVERY_EXPIRED", "The device recovery key has expired. Save online before leaving.");
      }
      const encrypted = await encryptRecord(key, `${slot}:${transactionUuid}`, snapshot);
      return store.change(slot, (current) => {
        if ((current?.revision || 0) !== expectedRevision ||
            (current?.terminal && current.transactionUuid === transactionUuid) ||
            (current && !current.terminal && current.transactionUuid !== transactionUuid)) {
          throw failure("LOCAL_DRAFT_CONFLICT", "This form has newer recovery input in another tab. Reopen it before editing.");
        }
        return {
          slot, transactionUuid, ownerTag: ownerTag || current?.ownerTag, unsynced, revision: expectedRevision + 1,
          keyId: descriptor.key_id, keyVersion: descriptor.key_version,
          expiresAt: new Date(expiry).toISOString(), savedAt: new Date(now()).toISOString(),
          terminal: false, ...encrypted,
        };
      });
    },
    acknowledge(slot, transactionUuid, revision) {
      return store.change(slot, (row) => {
        if (!row || row.terminal || row.transactionUuid !== transactionUuid || row.revision !== revision) return row;
        return { ...row, unsynced: false };
      });
    },
    async pendingForOwner(ownerTag) {
      const rows = await store.all();
      return rows.filter((row) => row && row.ownerTag === ownerTag && !row.terminal && !row.reserved && row.unsynced && Date.parse(row.expiresAt) > now())
        .map(({ slot, transactionUuid, revision }) => ({ slot, transactionUuid, revision }));
    },
    retire(slot, transactionUuid) {
      return store.change(slot, (current) => {
        if (current && current.transactionUuid !== transactionUuid) return current;
        return {
          slot, transactionUuid, ownerTag: current?.ownerTag, revision: (current?.revision || 0) + 1, terminal: true,
          iv: null, ciphertext: null, expiresAt: new Date(now() + 7 * DAY).toISOString(),
        };
      });
    },
  };
}

export const formDraftVault = createFormDraftVault();
