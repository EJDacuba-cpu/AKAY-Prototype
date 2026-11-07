import { test } from "node:test";
import assert from "node:assert/strict";
import { createFormDraftVault, importRecoveryKey, formDraftSlot, formDraftOwnerTag } from "./formDraftVault.js";

function memoryStore() {
  const rows = new Map();
  let queue = Promise.resolve();
  return {
    rows,
    get: async (slot) => rows.get(slot) || null,
    all: async () => [...rows.values()],
    change(slot, mutate) {
      const operation = queue.then(() => { const row = mutate(rows.get(slot) || null); rows.set(slot, row); return row; });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
const material = btoa(String.fromCharCode(...new Uint8Array(32).fill(19)));
const descriptor = { key_id: "key-1", key_version: 1, expires_at: "2099-01-01T00:00:00Z" };
const identity = { owner: "1:bhc:2", formType: "patient", mode: "edit", contextKey: "patient:3" };

test("empty form reservations converge on one identity without storing form input", async () => {
  const vault = createFormDraftVault({ store: memoryStore() });
  const first = await vault.reserve("slot", "first");
  const second = await vault.reserve("slot", "second");
  assert.equal(first.transactionUuid, second.transactionUuid);
  assert.equal(first.reserved, true);
  assert.equal(first.ciphertext, null);
});

test("persisted rows contain ciphertext, never input or a usable recovery key", async () => {
  const store = memoryStore();
  const vault = createFormDraftVault({ store });
  const slot = await formDraftSlot(identity);
  const key = await importRecoveryKey(material);
  assert.equal(key.extractable, false);
  const row = await vault.write({ slot, key, descriptor, transactionUuid: "tx-1", expectedRevision: 0, snapshot: { payload: { complaint: "Private input" }, serverVersion: null } });
  assert.equal(row.revision, 1);
  assert.doesNotMatch(JSON.stringify(row), /Private input|key_material|payload|owner|patient:3/);
  assert.equal((await vault.open(slot, key)).payload.complaint, "Private input");
  const other = await formDraftSlot({ ...identity, owner: "2:bhc:2" });
  assert.notEqual(slot, other);
  assert.equal(await vault.inspect(other), null);
});

test("transactional local revisions stop a second tab overwriting newer work", async () => {
  const vault = createFormDraftVault({ store: memoryStore() });
  const key = await importRecoveryKey(material);
  const input = { slot: "slot", key, descriptor, transactionUuid: "tx-1", expectedRevision: 0, snapshot: { payload: "first" } };
  await vault.write(input);
  await assert.rejects(vault.write({ ...input, snapshot: { payload: "stale" } }), { code: "LOCAL_DRAFT_CONFLICT" });
  assert.equal((await vault.open("slot", key)).payload, "first");
});

test("retirement blocks stale checkpoints and permits a distinct explicit transaction", async () => {
  const vault = createFormDraftVault({ store: memoryStore() });
  const key = await importRecoveryKey(material);
  const input = { slot: "slot", key, descriptor, transactionUuid: "tx-1", expectedRevision: 0, snapshot: { payload: "input" } };
  await vault.write(input);
  const terminal = await vault.retire("slot", "tx-1");
  assert.equal(terminal.ciphertext, null);
  await assert.rejects(vault.write({ ...input, expectedRevision: terminal.revision }), { code: "LOCAL_DRAFT_CONFLICT" });
  await vault.write({ ...input, transactionUuid: "tx-2", expectedRevision: terminal.revision });
  await vault.retire("slot", "tx-1");
  assert.equal((await vault.inspect("slot")).transactionUuid, "tx-2");
});

test("expired keys and altered envelope identities cannot unlock saved input", async () => {
  let now = 1000;
  const store = memoryStore();
  const vault = createFormDraftVault({ store, now: () => now });
  const key = await importRecoveryKey(material);
  await vault.write({ slot: "a", key, descriptor: { ...descriptor, expires_at: new Date(2000).toISOString() }, transactionUuid: "tx", expectedRevision: 0, snapshot: { payload: "private" } });
  store.rows.set("b", { ...store.rows.get("a"), slot: "b" });
  await assert.rejects(vault.open("b", key));
  now = 2000;
  await assert.rejects(vault.open("a", key), { code: "DRAFT_RECOVERY_EXPIRED" });
});

test("logout metadata is owner scoped and an old acknowledgement cannot mark newer input synced", async () => {
  const vault = createFormDraftVault({ store: memoryStore() });
  const ownerTag = await formDraftOwnerTag("one");
  const key = await importRecoveryKey(material);
  const input = { slot: "slot", key, descriptor, ownerTag, transactionUuid: "tx", expectedRevision: 0, snapshot: { payload: "first" } };
  await vault.write(input);
  assert.equal((await vault.pendingForOwner(ownerTag)).length, 1);
  assert.equal((await vault.pendingForOwner(await formDraftOwnerTag("other"))).length, 0);
  await vault.acknowledge("slot", "tx", 1);
  assert.equal((await vault.pendingForOwner(ownerTag)).length, 0);
  await vault.write({ ...input, expectedRevision: 1, snapshot: { payload: "newer" } });
  await vault.acknowledge("slot", "tx", 1);
  assert.equal((await vault.pendingForOwner(ownerTag)).length, 1);
  await vault.retire("slot", "tx");
  assert.equal((await vault.pendingForOwner(ownerTag)).length, 0);
});

test("retention sweep removes expired ciphertext even when its form is never reopened", async () => {
  let now = 1000;
  const store = memoryStore();
  const vault = createFormDraftVault({ store, now: () => now });
  const key = await importRecoveryKey(material);
  await vault.write({ slot: "forgotten", key, descriptor: { ...descriptor, expires_at: new Date(2000).toISOString() }, transactionUuid: "tx", snapshot: { payload: "Sensitive abandoned input" } });
  now = 2001;
  await vault.sweepExpired();
  assert.equal(store.rows.get("forgotten").ciphertext, null);
  assert.equal(store.rows.get("forgotten").terminal, true);
});
