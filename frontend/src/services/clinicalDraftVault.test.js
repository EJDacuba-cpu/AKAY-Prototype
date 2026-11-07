import test from "node:test";
import assert from "node:assert/strict";
import { createFormDraftVault } from "./formDraftVault.js";
import { createClinicalDraftVault } from "./clinicalDraftVault.js";

function fixture() {
  const rows = new Map();
  const vault = createFormDraftVault({ store: {
    all: async () => [...rows.values()],
    get: async (slot) => rows.get(slot) || null,
    change: async (slot, mutate) => { const row = mutate(rows.get(slot) || null); rows.set(slot, row); return row; },
  } });
  let allowed = true;
  let rejectionCode = "";
  let calls = 0;
  const key = { key_id: "key", key_version: 1, key_material: btoa("x".repeat(32)), expires_at: "2099-01-01T00:00:00Z", transaction_uuid: "consultation-1", context_key: "patient:7" };
  const api = {
    key: async () => { calls++; if (!allowed) throw Object.assign(new Error("Ended"), { status: 409 }); return key; },
    open: async () => { calls++; if (!allowed) throw Object.assign(new Error("Ended"), { status: 409, code: rejectionCode }); return key; },
  };
  const create = (owner = "owner", extra = {}) => createClinicalDraftVault({ owner, api, vault, available: () => true, ...extra });
  const target = { ownerKey: "owner", consultationKey: "consultation-1", contextKey: "patient:7" };
  const record = { draft: { consultationUuid: "consultation-1", patient: { id: "7" }, payload: { chiefComplaint: "Private input" }, version: 2 } };
  return { rows, vault, create, target, record, deny: (code = "") => { allowed = false; rejectionCode = code; }, calls: () => calls };
}

test("clinical checkpoint uses an authenticated in-memory key and reopens after session cleanup", async () => {
  const f = fixture(); const first = f.create();
  await first.prepareLocalDraft(f.target);
  await first.saveLocalDraft({ ...f.target, record: f.record });
  const calls = f.calls();
  first.clearMemory();
  assert.doesNotMatch(JSON.stringify([...f.rows.values()]), /Private input|key_material|patient:7/);
  const reopened = await f.create().listLocalDrafts("owner");
  assert.equal(reopened[0].record.draft.payload.chiefComplaint, "Private input");
  assert.ok(f.calls() > calls);
  assert.deepEqual(await f.create("another").listLocalDrafts("another"), []);
});

test("already prepared consultation can checkpoint offline but a cold session cannot decrypt without authorization", async () => {
  const f = fixture(); const first = f.create();
  await first.prepareLocalDraft(f.target); f.deny();
  await first.saveLocalDraft({ ...f.target, record: f.record });
  await assert.rejects(f.create().listLocalDrafts("owner"));
});

test("two clinical tabs cannot overwrite a newer local revision", async () => {
  const f = fixture(); const one = f.create(); const two = f.create();
  await one.prepareLocalDraft(f.target); await two.prepareLocalDraft(f.target);
  await one.saveLocalDraft({ ...f.target, record: f.record });
  await assert.rejects(two.saveLocalDraft({ ...f.target, record: f.record }), { code: "LOCAL_DRAFT_CONFLICT" });
});

test("retiring a clinical device copy blocks a stale timer in the old workspace", async () => {
  const f = fixture(); const one = f.create();
  await one.prepareLocalDraft(f.target); await one.saveLocalDraft({ ...f.target, record: f.record });
  await one.deleteLocalDraft(f.target);
  await assert.rejects(one.saveLocalDraft({ ...f.target, record: f.record }));
  assert.deepEqual(await f.create().listLocalDrafts("owner"), []);
});

test("legacy migration deletes the old row only after authorized filtering and durable resealing", async () => {
  const f = fixture(); let deleted = false;
  const legacy = { listLocalDrafts: async () => deleted ? [] : [{ consultationKey: "consultation:consultation-1", savedAt: new Date().toISOString(), record: f.record }], deleteLocalDraft: async () => { deleted = true; } };
  const api = {
    migrate: async () => ({ key: { key_id: "key", key_version: 1, key_material: btoa("x".repeat(32)), expires_at: "2099-01-01T00:00:00Z", transaction_uuid: "consultation-1", context_key: "patient:7" }, payload: { chiefComplaint: "Filtered" } }),
    open: async () => { throw new Error("Unneeded repeat read"); },
  };
  const migrated = f.create("owner", { api, legacy, legacyOwnerKey: "42" });
  const result = await migrated.listLocalDrafts("owner");
  assert.equal(deleted, true);
  assert.equal(result[0].record.draft.payload.chiefComplaint, "Filtered");
  assert.ok([...f.rows.values()][0].ciphertext);
  await assert.rejects(migrated.listLocalDrafts("owner"), /Unneeded repeat read/);
});

test("failed durable migration keeps the older recovery copy", async () => {
  const f = fixture(); let deleted = false;
  const legacy = { listLocalDrafts: async () => [{ consultationKey: "consultation:consultation-1", record: f.record }], deleteLocalDraft: async () => { deleted = true; } };
  const api = { migrate: async () => ({ key: { key_id: "key", key_version: 1, key_material: btoa("x".repeat(32)), expires_at: "2099-01-01T00:00:00Z", transaction_uuid: "consultation-1", context_key: "patient:7" }, payload: { chiefComplaint: "Filtered" } }) };
  const client = f.create("owner", { api, legacy, legacyOwnerKey: "42", vault: { ...f.vault, write: async () => { throw new Error("Disk full"); } } });
  await assert.rejects(client.listLocalDrafts("owner"), /Disk full/);
  assert.equal(deleted, false);
});

test("confirmed terminal server state clears a stale device copy after a lost cleanup response", async () => {
  const f = fixture(); const one = f.create();
  await one.prepareLocalDraft(f.target); await one.saveLocalDraft({ ...f.target, record: f.record });
  f.deny("CLINICAL_RECOVERY_ENDED");
  assert.deepEqual(await f.create().listLocalDrafts("owner"), []);
  assert.equal([...f.rows.values()][0].ciphertext, null);
});
