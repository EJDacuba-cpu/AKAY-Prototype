import { test } from "node:test";
import assert from "node:assert/strict";
import { createFormDraftCoordinator } from "./formDraftCoordinator.js";
import { createFormDraftVault } from "./formDraftVault.js";
import { registrationDraftSnapshot, restoreRegistrationDraft } from "../utils/patientRegistrationPayload.js";
import { storeRegistrationEntry, readRegistrationEntry, consumeRegistrationEntry } from "../utils/patientRegistrationEntry.js";

function fixture(saved = null) {
  const rows = new Map();
  const vault = createFormDraftVault({ store: {
    get: async (key) => rows.get(key) || null,
    change: async (key, action) => { const row = action(rows.get(key) || null); rows.set(key, row); return row; },
  } });
  let server = saved;
  let online = true;
  let number = 0;
  let terminal = null;
  const restored = [];
  const calls = [];
  const key = { key_id: "key", key_version: 1, key_material: btoa("x".repeat(32)), expires_at: "2099-01-01T00:00:00Z" };
  const api = {
    lookup: async () => server,
    status: async () => terminal ? { status: terminal } : { status: "active" },
    detail: async () => server,
    key: async () => key,
    create: async (identity, payload, transactionUuid) => {
      calls.push("create");
      server = { ...identity, id: "draft", version: 1, transaction_uuid: transactionUuid, payload: structuredClone(payload), last_saved_at: new Date().toISOString() };
      return server;
    },
    update: async (draft, identity, payload) => {
      calls.push("update");
      assert.equal(draft.version, server.version);
      server = { ...server, ...identity, version: server.version + 1, payload: structuredClone(payload) };
      return server;
    },
    discard: async () => { terminal = "discarded"; server = null; },
    retireDevice: async () => { terminal = "discarded"; },
  };
  const options = {
    identity: { form_type: "patient", mode: "create", context_key: "new" },
    owner: "admin:1", initialValue: { first_name: "" }, onRestore: (value) => restored.push(value),
    vault, api, online: () => online, uuid: () => `00000000-0000-4000-8000-${String(++number).padStart(12, "0")}`,
    schedule: () => 1, cancel: () => {},
  };
  return { options, api, vault, rows, calls, restored, offline: () => { online = false; }, online: () => { online = true; }, remote: (value) => { server = value; }, consumed: () => { terminal = "consumed"; server = null; }, server: () => server };
}

test("opening defaults creates no draft; edits and retries update one identity", async () => {
  const f = fixture(); const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  assert.equal(engine.getSnapshot().ready, true);
  assert.equal(f.calls.length, 0);
  engine.setValue({ first_name: "Clinic" }); await engine.flush();
  const transaction = engine.getSnapshot().transactionUuid;
  engine.setValue({ first_name: "Updated Clinic" }); await engine.flush();
  assert.deepEqual(f.calls, ["create", "update"]);
  assert.equal(engine.getSnapshot().transactionUuid, transaction);
  assert.equal(f.server().payload.first_name, "Updated Clinic");
  assert.equal(engine.getSnapshot().hasPendingChanges, false);
});

test("legacy registration input is normalized before hydration acknowledgement and remains editable", async () => {
  const f = fixture({ id: "draft", version: 2, transaction_uuid: "00000000-0000-4000-8000-000000000001", payload: { first_name: "Legacy input" } });
  f.options.initialValue = registrationDraftSnapshot({ form: { firstName: "" } });
  f.options.normalizeSnapshot = (payload) => {
    const restored = restoreRegistrationDraft(payload, { firstName: "" });
    return registrationDraftSnapshot({ ...restored, form: restored.form });
  };
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  await engine.resume();
  assert.equal(f.restored[0].registration.form.firstName, "Legacy input");
  assert.equal(engine.isReadyForValue(f.options.initialValue), false);
  assert.equal(engine.isReadyForValue(f.restored[0]), true);
  engine.setValue(f.restored[0], true);
  engine.setValue(registrationDraftSnapshot({ form: { firstName: "Newer input" } }));
  await engine.flush();
  assert.equal(f.server().payload.registration.form.firstName, "Newer input");
});

test("entry Resume hands the loaded coordinator to registration without another lookup, decision or draft", async () => {
  const f = fixture({ id: "draft", version: 4, transaction_uuid: "00000000-0000-4000-8000-000000000001", payload: { first_name: "Saved registration" } });
  let lookups = 0;
  const lookup = f.api.lookup;
  f.api.lookup = async (...args) => { lookups++; return lookup(...args); };
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  assert.equal(engine.getSnapshot().decision, true);
  assert.equal(engine.getSnapshot().ready, false);
  assert.equal(await engine.resume(), true);
  const rows = new Map();
  const client = { setQueryData: (key, value) => rows.set(JSON.stringify(key), value), getQueryData: (key) => rows.get(JSON.stringify(key)), removeQueries: ({ queryKey }) => rows.delete(JSON.stringify(queryKey)) };
  storeRegistrationEntry(client, f.options.owner, "/bhc/patients/add", engine);
  const prepared = readRegistrationEntry(client, f.options.owner, "/bhc/patients/add");
  assert.equal(prepared, engine);
  assert.equal(consumeRegistrationEntry(client, f.options.owner, "/bhc/patients/add", prepared), true);
  assert.equal(prepared.isReadyForValue({ first_name: "" }), false);
  const restored = structuredClone(prepared.latest);
  prepared.setValue(restored, true);
  assert.equal(prepared.isReadyForValue(restored), true);
  assert.equal(prepared.getSnapshot().decision, false);
  assert.equal(prepared.draft.id, "draft");
  assert.equal(prepared.draft.version, 4);
  assert.equal(lookups, 2); // Original check and deliberate Resume revalidation only.
  assert.equal(f.calls.length, 0);
  prepared.close();
});

test("repeated Resume and Discard cannot compete while restoration is in progress", async () => {
  const f = fixture({ id: "draft", version: 2, transaction_uuid: "00000000-0000-4000-8000-000000000001", payload: { first_name: "Saved input" } });
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  let finish;
  let loads = 0;
  const pending = new Promise((resolve) => { finish = resolve; });
  f.api.detail = async () => { loads++; await pending; return f.server(); };
  const first = engine.resume();
  await Promise.resolve();
  const second = engine.resume();
  const third = engine.discard();
  await Promise.resolve();
  assert.equal(loads, 1);
  assert.equal(engine.getSnapshot().ready, false);
  finish();
  await Promise.all([first, second, third]);
  assert.equal(f.restored.length, 1);
  assert.ok(f.server());
});

test("already-open offline input is checkpointed without submitting an official mutation", async () => {
  const f = fixture(); const engine = createFormDraftCoordinator(f.options);
  await engine.init(); f.offline(); engine.setValue({ first_name: "Unsent input" });
  await assert.rejects(engine.flush(), { code: "OFFLINE" });
  assert.equal(f.calls.length, 0);
  const row = [...f.rows.values()][0];
  assert.ok(row.ciphertext);
  assert.equal(engine.getSnapshot().status, "offline");
});

test("Resume restores the existing draft only after a deliberate decision", async () => {
  const f = fixture({ id: "existing", version: 4, transaction_uuid: "existing-tx", payload: { first_name: "Saved input" }, last_saved_at: "2026-11-07T00:00:00Z" });
  const engine = createFormDraftCoordinator(f.options); await engine.init();
  assert.equal(engine.getSnapshot().decision, true); assert.equal(f.restored.length, 0);
  await engine.resume();
  assert.deepEqual(f.restored, [{ first_name: "Saved input" }]);
  engine.setValue({ first_name: "Edited" }); await engine.flush();
  assert.deepEqual(f.calls, ["update"]); assert.equal(f.server().version, 5);
});

test("a consumed transaction after a lost response cannot restore old input as a new form", async () => {
  const f = fixture(); const first = createFormDraftCoordinator(f.options); await first.init();
  first.setValue({ first_name: "Already saved" }); await first.prepareCommit(); first.close(); f.consumed();
  const reopened = createFormDraftCoordinator(f.options); await reopened.init();
  assert.equal(reopened.getSnapshot().decision, false);
  assert.equal(reopened.getSnapshot().ready, true);
  assert.equal(f.restored.length, 0);
  assert.deepEqual(f.calls, ["create"]);
});

test("failed lookup blocks fresh editing; closing ignores a late network result", async () => {
  const f = fixture(); f.api.lookup = async () => { throw new Error("Lookup unavailable"); };
  const failed = createFormDraftCoordinator(f.options); await failed.init();
  assert.equal(failed.getSnapshot().ready, false);
  assert.match(failed.getSnapshot().error, /Lookup unavailable/);
  let resolve; let started;
  const requestStarted = new Promise((done) => { started = done; });
  f.api.lookup = () => { started(); return new Promise((done) => { resolve = done; }); };
  const closed = createFormDraftCoordinator(f.options); const pending = closed.init(); await requestStarted; closed.close(); resolve(null); await pending;
  assert.equal(closed.getSnapshot().ready, false); assert.equal(f.restored.length, 0);
});

test("snapshot fields fail closed on unregistered secrets", async () => {
  const f = fixture(); const engine = createFormDraftCoordinator(f.options); await engine.init();
  assert.throws(() => engine.setValue({ first_name: "Clinic", password: "secret" }), /unregistered/i);
  assert.equal(f.calls.length, 0);
  assert.equal(engine.hasUnprotectedChanges(), true);
  await assert.rejects(engine.flushBeforeLeave());
});

test("React strict effect replay can reopen the same engine without reviving an older setup", async () => {
  const f = fixture(); const engine = createFormDraftCoordinator(f.options);
  await engine.init(); engine.close(); await engine.init();
  assert.equal(engine.getSnapshot().ready, true);
  engine.setValue({ first_name: "After setup replay" }); await engine.flush();
  assert.equal(f.server().payload.first_name, "After setup replay");
});

test("new input arriving during a save drains to the same server draft", async () => {
  const f = fixture(); const original = f.api.create; let release; let started;
  const requestStarted = new Promise((done) => { started = done; });
  f.api.create = async (...args) => { started(); await new Promise((done) => { release = done; }); return original(...args); };
  const engine = createFormDraftCoordinator(f.options); await engine.init();
  engine.setValue({ first_name: "First" }); const saving = engine.flush(); await requestStarted;
  engine.setValue({ first_name: "Newest" }); release(); await saving;
  assert.deepEqual(f.calls, ["create", "update"]);
  assert.equal(f.server().payload.first_name, "Newest");
});

test("a server version conflict blocks final save and preserves reviewable device input", async () => {
  const f = fixture({ id: "draft", version: 1, transaction_uuid: "existing", payload: { first_name: "Original" } });
  const engine = createFormDraftCoordinator(f.options); await engine.init(); await engine.resume();
  engine.setValue({ first_name: "My unfinished change" });
  const update = f.api.update;
  f.remote({ ...f.server(), version: 2, payload: { first_name: "Another session" } });
  f.api.update = async () => { throw Object.assign(new Error("Draft changed"), { status: 409, payload: { data: f.server() } }); };
  await assert.rejects(engine.flush());
  assert.equal(engine.getSnapshot().ready, false);
  assert.equal(engine.getSnapshot().decision, true);
  assert.equal(await engine.resume(), false);
  f.api.update = update;
  assert.equal(await engine.resume("device"), true);
  await engine.flush();
  assert.equal(f.server().version, 3);
  assert.equal(f.server().payload.first_name, "My unfinished change");
});

test("successful official completion stays closed without showing a recovery decision", async () => {
  const f = fixture(); const engine = createFormDraftCoordinator(f.options); await engine.init();
  engine.setValue({ first_name: "Completed" }); await engine.prepareCommit(); await engine.complete();
  assert.equal(engine.getSnapshot().completed, true);
  assert.equal(engine.getSnapshot().ready, true);
  assert.equal(engine.getSnapshot().decision, false);
  engine.setValue({ first_name: "Late change" });
  await assert.rejects(engine.prepareCommit());
  assert.deepEqual(f.calls, ["create"]);
});

test("Resume rechecks a transaction completed in another session instead of restoring it", async () => {
  const f = fixture({ id: "draft", version: 1, transaction_uuid: "old", payload: { first_name: "Already official" } });
  const engine = createFormDraftCoordinator(f.options); await engine.init(); f.consumed();
  assert.equal(await engine.resume(), false);
  assert.equal(engine.getSnapshot().decision, false);
  assert.equal(f.restored.length, 0);
});

test("a stale parent render cannot overwrite input just restored by Resume", async () => {
  const f = fixture({ id: "draft", version: 1, transaction_uuid: "old", payload: { first_name: "Restored" } });
  const engine = createFormDraftCoordinator(f.options); await engine.init(); await engine.resume();
  engine.setValue({ first_name: "" }, true);
  await engine.prepareCommit();
  assert.equal(f.server().payload.first_name, "Restored");
  engine.setValue({ first_name: "Restored" }, true);
  engine.setValue({ first_name: "Typed after hydration" }, true);
  await engine.flush();
  assert.equal(f.server().payload.first_name, "Typed after hydration");
});

test("reverting untouched input cancels checkpoints instead of manufacturing an empty draft", async () => {
  const f = fixture(); const timers = new Set();
  const engine = createFormDraftCoordinator({ ...f.options, schedule: (callback) => { const timer = { callback }; timers.add(timer); return timer; }, cancel: (timer) => timers.delete(timer) });
  await engine.init(); engine.setValue({ first_name: "Temporary" }); engine.setValue({ first_name: "" });
  assert.equal(timers.size, 0);
  assert.equal([...f.rows.values()][0].reserved, true);
  assert.deepEqual(f.calls, []);
});

test("connection feedback is immediate and reconnect synchronizes only the unfinished draft", async () => {
  const f = fixture(); const engine = createFormDraftCoordinator(f.options); await engine.init();
  f.offline(); await engine.connectionChanged();
  assert.equal(engine.getSnapshot().status, "offline");
  engine.setValue({ first_name: "Device input" }); await engine.checkpoint();
  f.online(); await engine.connectionChanged();
  assert.deepEqual(f.calls, ["create"]);
  assert.equal(f.server().payload.first_name, "Device input");
});

test("closing flushes online drafts and preserves an offline checkpoint without final submission", async () => {
  const f = fixture(); const engine = createFormDraftCoordinator(f.options); await engine.init();
  engine.setValue({ first_name: "Online input" }); assert.equal(await engine.flushBeforeLeave(), true);
  assert.equal(f.server().payload.first_name, "Online input");
  f.offline(); engine.setValue({ first_name: "Offline input" });
  assert.equal(await engine.flushBeforeLeave(), true);
  assert.equal(f.server().payload.first_name, "Online input");
  assert.ok([...f.rows.values()][0].ciphertext);
});

test("typing after a server save immediately stops displaying Saved", async () => {
  const f = fixture(); const engine = createFormDraftCoordinator(f.options); await engine.init();
  engine.setValue({ first_name: "First" }); await engine.flush();
  assert.equal(engine.getSnapshot().status, "saved");
  engine.setValue({ first_name: "New typing" });
  assert.equal(engine.getSnapshot().status, "saving");
  f.offline(); engine.setValue({ first_name: "Offline typing" });
  assert.equal(engine.getSnapshot().status, "offline");
});

async function walkInRecovery() {
  const f = fixture();
  f.options.preferLatestRecovery = true;
  f.options.initialValue = registrationDraftSnapshot({ form: { firstName: "", lastName: "" } });
  f.options.normalizeSnapshot = (payload) => registrationDraftSnapshot(restoreRegistrationDraft(payload, { firstName: "", lastName: "" }));
  const first = createFormDraftCoordinator(f.options);
  await first.init();
  const saved = registrationDraftSnapshot({ form: { firstName: "Saved", lastName: "Patient", birthDate: "2020-", occupation: "Retained hidden field" },
    connection: { kind: "existing", householdId: "3", relationship: "Son" }, householdVersion: 4, walkIn: { key: "saved-walk-in-key" } });
  first.setValue(saved);
  await first.flush();
  first.close();
  f.calls.length = 0;
  const reopen = async () => { const engine = createFormDraftCoordinator(f.options); await engine.init(); return engine; };
  return { ...f, saved, reopen };
}

test("walk-in Resume hands saved fields and household/walk-in intent to the exact registration route without a second decision or submission", async () => {
  const f = await walkInRecovery();
  const engine = await f.reopen();
  assert.equal(await engine.resume(), true);
  assert.equal(engine.getSnapshot().conflict, false);
  assert.deepEqual(f.restored.at(-1), f.saved);
  const rows = new Map();
  const client = { setQueryData: (key, value) => rows.set(JSON.stringify(key), value), getQueryData: (key) => rows.get(JSON.stringify(key)), removeQueries: ({ queryKey }) => rows.delete(JSON.stringify(queryKey)) };
  const path = "/rhu/patients/add?check_in=1";
  storeRegistrationEntry(client, f.options.owner, path, engine);
  const prepared = readRegistrationEntry(client, f.options.owner, path);
  assert.equal(prepared, engine);
  assert.equal(consumeRegistrationEntry(client, f.options.owner, path, prepared), true);
  prepared.setValue(structuredClone(prepared.latest), true);
  assert.equal(prepared.isReadyForValue(f.saved), true);
  assert.equal(prepared.getSnapshot().decision, false);
  assert.deepEqual(f.calls, []);
});

test("walk-in matching copies resume automatically even across transaction identities and stay protected until hydration", async () => {
  const f = await walkInRecovery();
  f.remote({ ...f.server(), transaction_uuid: "other-transaction" });
  const before = structuredClone([...f.rows.values()][0]);
  const engine = await f.reopen();
  assert.equal(await engine.resume(), true);
  assert.equal(engine.getSnapshot().conflict, false);
  assert.deepEqual([...f.rows.values()][0], before);
  await assert.rejects(engine.checkpoint(), { code: "DRAFT_NOT_READY" });
  engine.setValue(engine.latest, true);
  engine.setValue(registrationDraftSnapshot({ form: { firstName: "Continued" } }));
  await engine.checkpoint();
  assert.equal([...f.rows.values()][0].transactionUuid, "other-transaction");
  assert.deepEqual(f.calls, []);
});

test("walk-in Resume restores newer unsynced device entries based on the current server revision", async () => {
  const f = await walkInRecovery();
  const editing = await f.reopen();
  await editing.resume(); editing.setValue(editing.latest, true);
  const newer = registrationDraftSnapshot({ form: { firstName: "Latest device", birthDate: "2021-" }, walkIn: { key: "same-registration" } });
  editing.setValue(newer); await editing.checkpoint(); editing.close();
  const engine = await f.reopen();
  assert.equal(await engine.resume(), true);
  assert.deepEqual(engine.latest, f.options.normalizeSnapshot(newer));
  assert.equal(engine.getSnapshot().conflict, false);
  assert.deepEqual(f.calls, []);
});

test("walk-in Resume selects a newer server revision over an acknowledged older device copy", async () => {
  const f = await walkInRecovery();
  const newest = registrationDraftSnapshot({ form: { firstName: "Latest server" } });
  f.remote({ ...f.server(), version: 3, payload: newest });
  const engine = await f.reopen();
  assert.equal(await engine.resume(), true);
  assert.deepEqual(engine.latest, f.options.normalizeSnapshot(newest));
  assert.equal(engine.getSnapshot().conflict, false);
  assert.deepEqual(f.calls, []);
});

test("walk-in Resume recognizes a lost save response using its confirmed payload link", async () => {
  const f = await walkInRecovery();
  const editing = await f.reopen();
  await editing.resume(); editing.setValue(editing.latest, true);
  const newer = registrationDraftSnapshot({ form: { firstName: "Unsent after lost response" } });
  editing.setValue(newer); await editing.checkpoint(); editing.close();
  // Same server payload under a higher revision: the recorded base still
  // proves the device edits descend from it.
  f.remote({ ...f.server(), version: 2 });
  const engine = await f.reopen();
  assert.equal(await engine.resume(), true);
  assert.deepEqual(engine.latest, f.options.normalizeSnapshot(newer));
  assert.deepEqual(f.calls, []);
});

test("walk-in unorderable copies stay intact until a deliberate choice, regardless of device clock", async () => {
  const f = await walkInRecovery();
  const editing = await f.reopen();
  await editing.resume(); editing.setValue(editing.latest, true);
  editing.setValue(registrationDraftSnapshot({ form: { firstName: "Device branch" } })); await editing.checkpoint(); editing.close();
  f.remote({ ...f.server(), version: 2, payload: registrationDraftSnapshot({ form: { firstName: "Server branch" } }), last_saved_at: "2000-01-01T00:00:00Z" });
  const before = structuredClone([...f.rows.values()][0]);
  const server = structuredClone(f.server());
  const engine = await f.reopen();
  assert.equal(await engine.resume(), false);
  assert.equal(engine.getSnapshot().conflict, true);
  assert.deepEqual([...f.rows.values()][0], before);
  assert.deepEqual(f.server(), server);
  assert.equal(f.restored.length, 1); // Only the earlier editing session.
  assert.equal(await engine.resume("server"), true);
  assert.equal(engine.latest.registration.form.firstName, "Server branch");
  assert.deepEqual([...f.rows.values()][0], before); // No destructive checkpoint during Resume.
  assert.deepEqual(f.calls, []);
});

test("walk-in recovery network, key and hydration failures retain both drafts and allow retry", async () => {
  for (const failure of ["detail", "key", "onRestore"]) {
    const f = await walkInRecovery();
    f.remote({ ...f.server(), transaction_uuid: "different-transaction" });
    const before = structuredClone([...f.rows.values()][0]);
    const server = structuredClone(f.server());
    const original = failure === "onRestore" ? f.options.onRestore : f.api[failure];
    if (failure === "onRestore") f.options.onRestore = () => { throw new Error("Hydration failed"); };
    else f.api[failure] = async () => { throw new Error("Recovery temporarily unavailable"); };
    const engine = await f.reopen();
    assert.equal(await engine.resume(), false);
    assert.equal(engine.getSnapshot().ready, false);
    assert.match(engine.getSnapshot().error, /draft is still saved.*Retry/);
    assert.deepEqual([...f.rows.values()][0], before);
    assert.deepEqual(f.server(), server);
    if (failure === "onRestore") engine.setRestoreHandler(original);
    else f.api[failure] = original;
    assert.equal(await engine.resume(), true);
    assert.deepEqual(f.calls, []);
  }
});

test("walk-in recovery uses a valid device snapshot if the server payload is malformed", async () => {
  const f = await walkInRecovery();
  f.remote({ ...f.server(), payload: { registration: { form: "malformed" } } });
  const before = structuredClone([...f.rows.values()][0]);
  const engine = await f.reopen();
  assert.equal(await engine.resume(), true);
  assert.deepEqual(engine.latest, f.saved);
  assert.deepEqual([...f.rows.values()][0], before);
  assert.deepEqual(f.calls, []);
});

test("other draft workflows keep the existing cross-transaction choice", async () => {
  const f = await walkInRecovery();
  f.options.preferLatestRecovery = false;
  f.remote({ ...f.server(), transaction_uuid: "other-transaction" });
  const engine = await f.reopen();
  assert.equal(await engine.resume(), false);
  assert.equal(engine.getSnapshot().conflict, true);
  assert.equal(engine.getSnapshot().ready, false);
});

test("walk-in Resume cannot revive a registration completed in another session", async () => {
  const f = await walkInRecovery();
  const engine = await f.reopen();
  f.consumed();
  assert.equal(await engine.resume(), false);
  assert.equal(f.restored.length, 0);
  assert.equal(engine.getSnapshot().decision, false);
  assert.deepEqual(f.calls, []);
});

test("walk-in failed snapshot validation and decryption preserve ciphertext and server input", async () => {
  for (const failure of ["normalizeSnapshot", "open"]) {
    const f = await walkInRecovery();
    const before = structuredClone([...f.rows.values()][0]);
    const server = structuredClone(f.server());
    if (failure === "normalizeSnapshot") f.options.normalizeSnapshot = () => { throw new Error("Invalid snapshot"); };
    else f.vault.open = async () => { throw new Error("Cannot decrypt copy"); };
    const engine = await f.reopen();
    assert.equal(await engine.resume(), false);
    assert.match(engine.getSnapshot().error, /draft is still saved.*Retry/);
    assert.equal(f.restored.length, 0);
    assert.deepEqual([...f.rows.values()][0], before);
    assert.deepEqual(f.server(), server);
    assert.deepEqual(f.calls, []);
  }
});

test("walk-in uncheckpointed entries cannot be replaced by an acknowledged older device copy", async () => {
  const f = await walkInRecovery();
  const engine = await f.reopen();
  await engine.resume(); engine.setValue(engine.latest, true);
  engine.setValue(registrationDraftSnapshot({ form: { firstName: "Unsaved in open form" } }));
  f.remote({ ...f.server(), version: 2, payload: registrationDraftSnapshot({ form: { firstName: "Other session" } }) });
  assert.equal(await engine.resume(), false);
  assert.equal(engine.getSnapshot().conflict, true);
  assert.equal(await engine.resume("device"), true);
  assert.equal(engine.latest.registration.form.firstName, "Unsaved in open form");
  assert.deepEqual(f.calls, []);
});
