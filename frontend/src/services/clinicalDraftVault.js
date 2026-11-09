import { formDraftOwnerTag, formDraftSlot, importRecoveryKey } from "./formDraftVault.js";

const failure = (code, message) => Object.assign(new Error(message), { code });

/** One instance per actor/context; usable keys live only in this instance's memory. */
export function createClinicalDraftVault({ owner, api, vault, available, legacy = null, legacyOwnerKey = "" }) {
  const prepared = new Map();
  let generation = 0;
  let migration = null;
  const uuidFor = (value) => String(value || "").replace(/^consultation:/, "");
  const checkOwner = (value) => {
    if (value !== owner) throw failure("DRAFT_SESSION_CHANGED", "The account or working facility changed. Reopen the consultation.");
  };
  const slotFor = (uuid) => formDraftSlot({ owner, formType: "consultation", mode: "edit", contextKey: uuid });
  const adoptKey = async (descriptor, row, epoch) => {
    if (descriptor.transaction_uuid !== row.transactionUuid || descriptor.key_id !== row.keyId) {
      throw failure("DRAFT_RECOVERY_INVALID", "The recovery identity does not match this consultation.");
    }
    const key = await importRecoveryKey(descriptor.key_material);
    if (epoch !== generation) throw failure("DRAFT_SESSION_CHANGED", "The session changed.");
    const entry = { key, descriptor: { key_id: descriptor.key_id, key_version: descriptor.key_version, expires_at: descriptor.expires_at }, contextKey: descriptor.context_key, slot: row.slot, revision: row.revision };
    prepared.set(row.transactionUuid, entry);
    return entry;
  };
  async function prepareLocalDraft({ ownerKey, consultationKey: localKey, contextKey }) {
    checkOwner(ownerKey);
    const consultationKey = uuidFor(localKey);
    const cached = prepared.get(consultationKey);
    if (cached && Date.parse(cached.descriptor.expires_at) > Date.now()) return cached;
    const epoch = generation;
    const slot = await slotFor(consultationKey);
    const row = await vault.inspect(slot);
    if (row?.terminal && row.transactionUuid === consultationKey) throw failure("DRAFT_RECOVERY_EXPIRED", "This consultation recovery has ended.");
    const descriptor = row?.keyId ? await api.open(row.keyId) : await api.key(contextKey, consultationKey);
    if (descriptor.transaction_uuid !== consultationKey || (contextKey && descriptor.context_key !== contextKey)) {
      throw failure("DRAFT_RECOVERY_INVALID", "The consultation belongs to a different patient or visit.");
    }
    const reserved = row || await vault.reserve(slot, consultationKey, false, await formDraftOwnerTag(owner));
    return adoptKey(descriptor, { ...reserved, keyId: descriptor.key_id }, epoch);
  }
  async function readRow(row) {
    const epoch = generation;
    // Always reauthorize a recovery read, including a still-open session.
    let descriptor;
    try { descriptor = await api.open(row.keyId); }
    catch (error) {
      if (error.code !== "CLINICAL_RECOVERY_ENDED") throw error;
      await vault.retire(row.slot, row.transactionUuid);
      prepared.delete(row.transactionUuid);
      return null;
    }
    const entry = await adoptKey(descriptor, row, epoch);
    const snapshot = await vault.open(row.slot, entry.key);
    if (epoch !== generation) throw failure("DRAFT_SESSION_CHANGED", "The session changed.");
    if (snapshot?.record?.draft?.consultationUuid !== row.transactionUuid) throw failure("DRAFT_RECOVERY_INVALID", "The saved consultation identity is invalid.");
    return { consultationKey: `consultation:${row.transactionUuid}`, savedAt: row.savedAt, record: snapshot.record, contextKey: entry.contextKey, base: snapshot.base || null };
  }
  async function migrateLegacy() {
    if (!legacy || !legacyOwnerKey) return [];
    const epoch = generation;
    const migrated = [];
    const entries = await legacy.listLocalDrafts(legacyOwnerKey);
    for (const old of entries) {
      const draft = old.record?.draft;
      const uuid = uuidFor(old.consultationKey);
      if (!draft || !uuid || draft.consultationUuid !== uuid || !draft.patient?.id) {
        throw failure("DRAFT_RECOVERY_INVALID", "An older recovery copy needs review before migration. It has been kept on this device.");
      }
      const slot = await slotFor(uuid);
      const current = await vault.inspect(slot);
      if (current?.terminal) {
        await legacy.deleteLocalDraft({ ownerKey: legacyOwnerKey, consultationKey: old.consultationKey });
        continue;
      }
      if (current?.ciphertext) {
        const opened = await readRow(current);
        if (!opened) {
          await legacy.deleteLocalDraft({ ownerKey: legacyOwnerKey, consultationKey: old.consultationKey });
          continue;
        }
        if (Date.parse(current.savedAt) < Date.parse(old.savedAt)) throw failure("LOCAL_DRAFT_CONFLICT", "This device has two different recovery copies. Keep this page open and review them before proceeding.");
        migrated.push(opened);
      } else {
        const contextKey = draft.payload?.rhuVisitId ? `visit:${draft.payload.rhuVisitId}` : `patient:${draft.patient.id}`;
        const result = await api.migrate(contextKey, uuid, draft.payload || {});
        if (epoch !== generation) throw failure("DRAFT_SESSION_CHANGED", "The session changed.");
        if (result.key.transaction_uuid !== uuid || result.key.context_key !== contextKey) throw failure("DRAFT_RECOVERY_INVALID", "The recovery target changed.");
        const reserved = current || await vault.reserve(slot, uuid, false, await formDraftOwnerTag(owner));
        await adoptKey(result.key, { ...reserved, keyId: result.key.key_id }, epoch);
        const record = { draft: { id: String(draft.id || ""), consultationUuid: uuid, version: Number(draft.version || 0), patient: { id: String(draft.patient.id), label: String(draft.patient.label || "Patient") }, classification: String(draft.classification || ""), lastSavedAt: draft.lastSavedAt || "", payload: result.payload, medicineSelections: [] } };
        const savedAt = await client.saveLocalDraft({ ownerKey: owner, consultationKey: uuid, record });
        migrated.push({ consultationKey: `consultation:${uuid}`, savedAt, record, contextKey, base: null });
      }
      if (epoch !== generation) throw failure("DRAFT_SESSION_CHANGED", "The session changed.");
      // A failed server authorization or durable write never reaches this deletion.
      await legacy.deleteLocalDraft({ ownerKey: legacyOwnerKey, consultationKey: old.consultationKey });
    }
    return migrated;
  }
  const client = {
    isLocalDraftVaultAvailable: available,
    prepareLocalDraft,
    clearMemory() { generation++; prepared.clear(); migration = null; },
    async saveLocalDraft({ ownerKey, consultationKey: localKey, record, base = null, synced = false }) {
      checkOwner(ownerKey);
      const consultationKey = uuidFor(localKey);
      const entry = prepared.get(consultationKey);
      if (!entry) throw failure("DRAFT_KEY_UNAVAILABLE", "Device recovery needs an online connection before it can protect this consultation.");
      if (record?.draft?.consultationUuid !== consultationKey) throw failure("DRAFT_RECOVERY_INVALID", "The consultation identity changed.");
      const row = await vault.write({ slot: entry.slot, key: entry.key, descriptor: entry.descriptor, ownerTag: await formDraftOwnerTag(owner), transactionUuid: consultationKey, expectedRevision: entry.revision, snapshot: { record, base }, unsynced: !synced });
      entry.revision = row.revision;
      entry.payload = JSON.stringify(record.draft.payload);
      return row.savedAt;
    },
    async acknowledgeLocalDraft({ ownerKey, consultationKey, payload }) {
      checkOwner(ownerKey);
      const uuid = uuidFor(consultationKey);
      const entry = prepared.get(uuid);
      if (entry && entry.payload === JSON.stringify(payload)) await vault.acknowledge(entry.slot, uuid, entry.revision);
    },
    async readLocalDraft({ ownerKey, consultationKey }) {
      checkOwner(ownerKey);
      const row = await vault.inspect(await slotFor(uuidFor(consultationKey)));
      return row && !row.terminal && !row.reserved ? readRow(row) : null;
    },
    async listLocalDrafts(ownerKey) {
      checkOwner(ownerKey);
      if (!migration) migration = migrateLegacy().catch((error) => { migration = null; throw error; });
      const pending = migration;
      const moved = await pending;
      if (migration === pending) migration = Promise.resolve([]);
      const rows = await vault.rowsForOwner(await formDraftOwnerTag(owner));
      const clinical = [...moved];
      // Ordinary forms share the store but have different opaque slots.
      for (const row of rows) {
        if (row.slot !== await slotFor(row.transactionUuid)) continue;
        if (moved.some((entry) => uuidFor(entry.consultationKey) === row.transactionUuid)) continue;
        const opened = await readRow(row);
        if (opened) clinical.push(opened);
      }
      return clinical.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    },
    async deleteLocalDraft({ ownerKey, consultationKey }) {
      checkOwner(ownerKey);
      const uuid = uuidFor(consultationKey);
      await vault.retire(await slotFor(uuid), uuid);
      prepared.delete(uuid);
    },
    async discardDeviceDraft({ ownerKey, consultationKey }) {
      checkOwner(ownerKey);
      const uuid = uuidFor(consultationKey);
      const row = await vault.inspect(await slotFor(uuid));
      if (!row?.keyId) throw failure("DRAFT_RECOVERY_INVALID", "No device recovery identity was found.");
      const cached = prepared.get(uuid);
      const contextKey = cached?.contextKey || (await api.open(row.keyId)).context_key;
      await api.discard(contextKey, uuid, row.keyId);
      await client.deleteLocalDraft({ ownerKey, consultationKey });
    },
  };
  return client;
}
