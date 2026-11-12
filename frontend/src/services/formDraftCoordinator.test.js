import { test } from "node:test";
import assert from "node:assert/strict";
import { createFormDraftCoordinator } from "./formDraftCoordinator.js";
import { registrationDraftSnapshot, restoreRegistrationDraft } from "../utils/patientRegistrationPayload.js";
import { storeRegistrationEntry, readRegistrationEntry, consumeRegistrationEntry } from "../utils/patientRegistrationEntry.js";

function fixture(saved = null) {
  let server = saved;
  let online = true;
  let number = 0;
  const terminals = new Map();
  const restored = [];
  const calls = [];
  const api = {
    lookup: async () => server,
    status: async (_identity, transactionUuid) => terminals.has(transactionUuid) ? { status: terminals.get(transactionUuid) } : { status: "active" },
    detail: async () => server,
    create: async (identity, payload, transactionUuid) => {
      calls.push("create");
      server = { ...identity, id: "draft", version: 1, transaction_uuid: transactionUuid, payload: structuredClone(payload), last_saved_at: new Date().toISOString() };
      return server;
    },
    update: async (draft, identity, payload) => {
      calls.push("update");
      if (draft.version !== server.version) {
        throw Object.assign(new Error("version conflict"), { status: 409, data: server });
      }
      server = { ...server, ...identity, version: server.version + 1, payload: structuredClone(payload), last_saved_at: new Date().toISOString() };
      return server;
    },
    discard: async (draft) => { terminals.set(draft.transaction_uuid, "discarded"); server = null; },
  };
  const options = {
    identity: { form_type: "patient", mode: "create", context_key: "new" },
    owner: "admin:1", initialValue: { first_name: "" }, onRestore: (value) => restored.push(value),
    api, online: () => online, uuid: () => `00000000-0000-4000-8000-${String(++number).padStart(12, "0")}`,
    schedule: () => 1, cancel: () => {},
  };
  return {
    options, api, calls, restored,
    offline: () => { online = false; },
    online: () => { online = true; },
    remote: (value) => { server = value; },
    consumed: () => { if (server?.transaction_uuid) terminals.set(server.transaction_uuid, "consumed"); server = null; },
    server: () => server,
  };
}

test("commit reuses an unchanged saved draft without another write", async () => {
  const f = fixture(); const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  engine.setValue({ first_name: "Clinic" }); await engine.flush();
  const metadata = await engine.prepareCommit();
  assert.deepEqual(f.calls, ["create"]);
  assert.equal(metadata.draftCommit.version, 1);
  engine.close();
});

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
  assert.equal(lookups, 1);
  assert.equal(engine.getSnapshot().decision, true);
  assert.equal(await engine.resume(), true);
  assert.equal(lookups, 2);
  const client = { data: null, setQueryData(_key, value) { this.data = value; }, getQueryData() { return this.data; }, removeQueries() { this.data = null; } };
  storeRegistrationEntry(client, "admin:1", "/bhc/patients/add", engine);
  assert.equal(consumeRegistrationEntry(client, "admin:1", "/bhc/patients/add", engine), true);
  assert.equal(readRegistrationEntry(client, "admin:1", "/bhc/patients/add"), engine);
  assert.equal(engine.getSnapshot().decision, false);
  assert.equal(engine.getSnapshot().ready, true);
  assert.deepEqual(f.calls, []);
});

test("Discard clears the server draft and opens a fresh ready form", async () => {
  const f = fixture({ id: "draft", version: 1, transaction_uuid: "00000000-0000-4000-8000-000000000001", payload: { first_name: "Saved" } });
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  assert.equal(engine.getSnapshot().decision, true);
  await engine.discard();
  assert.equal(f.server(), null);
  assert.equal(engine.getSnapshot().ready, true);
  assert.equal(engine.getSnapshot().decision, false);
  assert.deepEqual(engine.latest, { first_name: "" });
});

test("a pending autosave started before Discard cannot recreate the discarded draft", async () => {
  let releaseSave;
  const gate = new Promise((resolve) => { releaseSave = resolve; });
  const f = fixture();
  const create = f.api.create;
  f.api.create = async (...args) => {
    await gate;
    return create(...args);
  };
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  engine.setValue({ first_name: "Pending" });
  const pending = engine.flush();
  await engine.discard();
  releaseSave();
  await assert.rejects(pending, /reopen the form|current account|session/i);
  assert.equal(f.server(), null);
  assert.equal(engine.draft, null);
  assert.equal(engine.getSnapshot().ready, true);
  assert.equal(engine.getSnapshot().decision, false);
});

test("a delayed update after session replacement does not discard the existing server draft", async () => {
  let releaseSave;
  const gate = new Promise((resolve) => { releaseSave = resolve; });
  const f = fixture({
    id: "draft",
    version: 1,
    transaction_uuid: "00000000-0000-4000-8000-000000000001",
    payload: { first_name: "Saved" },
    form_type: "patient",
    mode: "create",
    context_key: "new",
  });
  const update = f.api.update;
  const discard = f.api.discard;
  let discards = 0;
  f.api.update = async (...args) => {
    await gate;
    return update(...args);
  };
  f.api.discard = async (...args) => {
    discards += 1;
    return discard(...args);
  };
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  assert.equal(await engine.resume(), true);
  engine.setValue({ first_name: "Updated" });
  const pending = engine.flush();
  // Session replacement advances epoch without an intentional Discard.
  await engine.init();
  releaseSave();
  await assert.rejects(pending, /reopen the form|current account|session/i);
  assert.equal(discards, 0);
  assert.ok(f.server());
  assert.equal(f.server().id, "draft");
  assert.equal(f.server().payload.first_name, "Updated");
  assert.equal(f.server().version, 2);
});

test("a delayed update during Resume does not discard the existing server draft", async () => {
  let releaseSave;
  const gate = new Promise((resolve) => { releaseSave = resolve; });
  const f = fixture({
    id: "draft",
    version: 1,
    transaction_uuid: "00000000-0000-4000-8000-000000000001",
    payload: { first_name: "Saved" },
    form_type: "patient",
    mode: "create",
    context_key: "new",
  });
  const update = f.api.update;
  const discard = f.api.discard;
  let discards = 0;
  f.api.update = async (...args) => {
    await gate;
    return update(...args);
  };
  f.api.discard = async (...args) => {
    discards += 1;
    return discard(...args);
  };
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  assert.equal(await engine.resume(), true);
  engine.setValue({ first_name: "Edited" });
  const pending = engine.flush();
  // Resume bumps epoch while the update is still in flight.
  const resumed = engine.resume();
  releaseSave();
  await assert.rejects(pending, /reopen the form|current account|session/i);
  assert.equal(await resumed, true);
  assert.equal(discards, 0);
  assert.ok(f.server());
  assert.equal(f.server().payload.first_name, "Edited");
});

test("a delayed create after session replacement still retires the orphan draft", async () => {
  let releaseSave;
  const gate = new Promise((resolve) => { releaseSave = resolve; });
  const f = fixture();
  const create = f.api.create;
  f.api.create = async (...args) => {
    await gate;
    return create(...args);
  };
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  engine.setValue({ first_name: "Orphan" });
  const pending = engine.flush();
  await engine.init();
  releaseSave();
  await assert.rejects(pending, /reopen the form|current account|session/i);
  assert.equal(f.server(), null);
});

test("Discard of an existing draft stays final when an update was still in flight", async () => {
  let releaseSave;
  const gate = new Promise((resolve) => { releaseSave = resolve; });
  const f = fixture({
    id: "draft",
    version: 1,
    transaction_uuid: "00000000-0000-4000-8000-000000000001",
    payload: { first_name: "Saved" },
    form_type: "patient",
    mode: "create",
    context_key: "new",
  });
  const update = f.api.update;
  f.api.update = async (...args) => {
    await gate;
    return update(...args);
  };
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  assert.equal(await engine.resume(), true);
  engine.setValue({ first_name: "Updated" });
  const pending = engine.flush();
  await engine.discard();
  releaseSave();
  await assert.rejects(pending);
  assert.equal(f.server(), null);
  assert.equal(engine.draft, null);
  assert.equal(engine.getSnapshot().ready, true);
  assert.equal(engine.getSnapshot().decision, false);
  assert.equal(engine.getSnapshot().conflict, false);
});

test("repeated Resume and Discard cannot compete while restoration is in progress", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const f = fixture({ id: "draft", version: 1, transaction_uuid: "00000000-0000-4000-8000-000000000001", payload: { first_name: "Saved" } });
  f.api.detail = async () => { await gate; return f.server(); };
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  const first = engine.resume();
  assert.equal(engine.getSnapshot().busy, true);
  assert.equal(await engine.resume(), false);
  assert.equal(await engine.discard(), false);
  release();
  assert.equal(await first, true);
});

test("Resume restores the existing draft only after a deliberate decision", async () => {
  const f = fixture({ id: "draft", version: 1, transaction_uuid: "00000000-0000-4000-8000-000000000001", payload: { first_name: "Saved" } });
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  assert.equal(engine.getSnapshot().ready, false);
  assert.equal(engine.getSnapshot().decision, true);
  assert.equal(f.restored.length, 0);
  assert.equal(await engine.resume(), true);
  assert.deepEqual(f.restored.at(-1), { first_name: "Saved" });
  assert.equal(engine.getSnapshot().ready, true);
});

test("a consumed transaction after a lost response cannot restore old input as a new form", async () => {
  const f = fixture({ id: "draft", version: 1, transaction_uuid: "00000000-0000-4000-8000-000000000001", payload: { first_name: "Saved" } });
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  f.consumed();
  assert.equal(await engine.resume(), false);
  assert.equal(engine.getSnapshot().ready, true);
  assert.equal(engine.getSnapshot().decision, false);
});

test("failed lookup blocks fresh editing; closing ignores a late network result", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const f = fixture();
  f.api.lookup = async () => { await gate; throw new Error("network"); };
  const engine = createFormDraftCoordinator(f.options);
  const pending = engine.init();
  assert.equal(engine.getSnapshot().ready, false);
  engine.close();
  release();
  await pending;
  assert.equal(engine.getSnapshot().closed, true);
});

test("failed lookup shows Retry-friendly copy and never pretends the form is ready", async () => {
  const f = fixture();
  f.api.lookup = async () => { throw new Error("ECONNRESET 500 FORM_DRAFT_LOOKUP"); };
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  assert.equal(engine.getSnapshot().ready, false);
  assert.equal(engine.getSnapshot().decision, true);
  assert.match(engine.getSnapshot().error, /couldn't check for unfinished work/i);
  assert.doesNotMatch(engine.getSnapshot().error, /ECONNRESET|500|FORM_DRAFT/);
});

test("snapshot fields fail closed on unregistered secrets", async () => {
  const f = fixture();
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  assert.throws(() => engine.setValue({ first_name: "Clinic", secret_token: "nope" }));
  await assert.rejects(engine.flushBeforeLeave());
});

test("new input arriving during a save drains to the same server draft", async () => {
  const f = fixture();
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  engine.setValue({ first_name: "One" });
  const first = engine.flush();
  engine.setValue({ first_name: "Two" });
  await first;
  await engine.flush();
  assert.equal(f.server().payload.first_name, "Two");
  assert.deepEqual(f.calls, ["create", "update"]);
});

test("a server version conflict blocks final save and keeps current inputs", async () => {
  const f = fixture();
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  engine.setValue({ first_name: "Clinic" }); await engine.flush();
  f.remote({ ...f.server(), version: 99, payload: { first_name: "Other session" } });
  engine.setValue({ first_name: "Local edit" });
  await assert.rejects(engine.flush());
  assert.equal(engine.getSnapshot().conflict, true);
  assert.equal(engine.getSnapshot().ready, false);
  assert.deepEqual(engine.latest, { first_name: "Local edit" });
  assert.match(engine.getSnapshot().error, /updated elsewhere|couldn't be saved|Review the latest/i);
});

test("successful official completion stays closed without showing a recovery decision", async () => {
  const f = fixture();
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  engine.setValue({ first_name: "Clinic" }); await engine.flush();
  await engine.complete();
  assert.equal(engine.getSnapshot().closed, true);
  assert.equal(engine.getSnapshot().decision, false);
  assert.equal(engine.getSnapshot().ready, true);
});

test("Resume rechecks a transaction completed in another session instead of restoring it", async () => {
  const f = fixture({ id: "draft", version: 1, transaction_uuid: "00000000-0000-4000-8000-000000000001", payload: { first_name: "Saved" } });
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  f.consumed();
  assert.equal(await engine.resume(), false);
  assert.equal(engine.getSnapshot().decision, false);
});

test("a stale parent render cannot overwrite input just restored by Resume", async () => {
  const f = fixture({ id: "draft", version: 1, transaction_uuid: "00000000-0000-4000-8000-000000000001", payload: { first_name: "Saved" } });
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  await engine.resume();
  engine.setValue({ first_name: "" }, true);
  assert.deepEqual(engine.latest, { first_name: "Saved" });
  engine.setValue({ first_name: "Saved" }, true);
  engine.setValue({ first_name: "Edited" });
  assert.deepEqual(engine.latest, { first_name: "Edited" });
});

test("reverting untouched input cancels checkpoints instead of manufacturing an empty draft", async () => {
  const f = fixture();
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  engine.setValue({ first_name: "Clinic" });
  assert.equal(engine.getSnapshot().hasPendingChanges, true);
  engine.setValue({ first_name: "" });
  assert.equal(engine.getSnapshot().hasPendingChanges, false);
  assert.equal(f.server(), null);
});

test("offline leave requires a confirmed server save", async () => {
  const f = fixture();
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  engine.setValue({ first_name: "Clinic" });
  f.offline();
  await assert.rejects(engine.flushBeforeLeave(), /couldn't be saved/i);
  assert.deepEqual(engine.latest, { first_name: "Clinic" });
});

test("online leave flushes before navigation", async () => {
  const f = fixture();
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  engine.setValue({ first_name: "Clinic" });
  assert.equal(await engine.flushBeforeLeave(), true);
  assert.equal(f.server().payload.first_name, "Clinic");
});

test("typing after a server save immediately stops displaying Saved", async () => {
  const f = fixture();
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  engine.setValue({ first_name: "Clinic" }); await engine.flush();
  assert.equal(engine.getSnapshot().status, "saved");
  engine.setValue({ first_name: "Clinic updated" });
  assert.equal(engine.getSnapshot().status, "saving");
});

test("walk-in Resume restores server fields for the registration route", async () => {
  const payload = registrationDraftSnapshot({ form: { firstName: "Walk-in", birthDate: "2020-01-01" }, walkIn: { key: "visit-1" } });
  const f = fixture({ id: "draft", version: 1, transaction_uuid: "00000000-0000-4000-8000-000000000001", payload });
  f.options.initialValue = registrationDraftSnapshot({ form: { firstName: "" } });
  f.options.normalizeSnapshot = (value) => registrationDraftSnapshot(restoreRegistrationDraft(value, { firstName: "" }));
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  assert.equal(await engine.resume(), true);
  assert.equal(engine.getSnapshot().conflict, false);
  assert.equal(f.restored.at(-1).registration.form.firstName, "Walk-in");
  assert.equal(engine.latest.registration.form.firstName, "Walk-in");
});

test("registration autosave flushes dirty input to the server", async () => {
  const f = fixture();
  const engine = createFormDraftCoordinator(f.options);
  await engine.init();
  engine.setValue({ first_name: "Timed" });
  await engine.flush();
  assert.equal(f.server()?.payload.first_name, "Timed");
  engine.close();
});
