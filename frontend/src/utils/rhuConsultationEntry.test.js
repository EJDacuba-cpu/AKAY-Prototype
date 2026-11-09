import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers";
import * as recovery from "./rhuDraftResume.js";
import { queueRowActions } from "./rhuQueueView.js";

const visit = { id: 19, patient: { id: 7 }, status: "in_consultation", consultation_uuid: "uuid-1" };
const draft = { id: "draft-1", patient: { id: "7" }, consultationUuid: "uuid-1", version: 4, payload: { rhuVisitId: 19, chiefComplaint: "Saved input" } };
function dependencies(overrides = {}) {
  return {
    lookup: async () => draft,
    load: async () => draft,
    discard: async () => {},
    ...overrides,
  };
}

test("waiting and in-consultation visits share one entry action with distinct labels", () => {
  const duties = { canEncode: true, canFinalize: true };
  assert.deepEqual(queueRowActions({ statusKey: "waiting" }, duties), [{ label: "Start Consultation", action: "open" }]);
  assert.deepEqual(queueRowActions({ statusKey: "in_consultation" }, duties), [{ label: "Open Consultation", action: "open" }]);
  assert.deepEqual(queueRowActions({ statusKey: "waiting" }, { canFinalize: true }), []);
  assert.deepEqual(queueRowActions({ statusKey: "in_consultation" }), []);
});

test("entry checks the authorized visit slot without claiming or creating a draft", async () => {
  const calls = [];
  const result = await recovery.lookupRhuRecovery({ visit, patientId: "7", owner: "owner", api: dependencies({
    lookup: async (args) => { calls.push(args); return draft; },
    load: async () => { throw new Error("lookup must not claim"); },
  }) });
  assert.deepEqual(calls, [{ patientId: "7", rhuVisitId: 19, draftOwnerContext: "owner" }]);
  assert.equal(result.server.id, "draft-1");
});

test("no draft returns no recovery decision; lookup failure remains an error", async () => {
  assert.equal(await recovery.lookupRhuRecovery({ visit, patientId: "7", owner: "owner", api: dependencies({ lookup: async () => null }) }), null);
  await assert.rejects(recovery.lookupRhuRecovery({ visit, patientId: "7", owner: "owner", api: dependencies({ lookup: async () => { throw new Error("Offline"); } }) }), /Offline/);
});

test("resume waits for the claimed payload and preserves its revision", async () => {
  let finish;
  const pending = recovery.resumeRhuRecovery({ visit, patientId: "7", owner: "owner", decision: { server: draft }, api: dependencies({
    load: async (id, options) => {
      assert.equal(id, "draft-1");
      assert.equal(options.draftOwnerContext, "owner");
      return new Promise((resolve) => { finish = resolve; });
    },
  }) });
  let settled = false;
  pending.then(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  finish({ ...draft, version: 5 });
  const result = await pending;
  assert.equal(result.draft.version, 5);
  assert.equal(result.draft.payload.chiefComplaint, "Saved input");
});

test("resume refuses a replacement draft instead of silently opening a different identity", async () => {
  await assert.rejects(recovery.resumeRhuRecovery({ visit, patientId: "7", owner: "owner", decision: { server: draft }, api: dependencies({
    lookup: async () => ({ ...draft, id: "replacement" }),
  }) }), /changed|match/i);
});

test("patient, visit and consultation mismatches cannot hydrate a workspace", () => {
  assert.equal(recovery.rhuRecoveryMatches({ visit, patientId: "7", draft }), true);
  for (const invalid of [{ ...draft, patient: { id: "8" } }, { ...draft, consultationUuid: "other" }, { ...draft, payload: { rhuVisitId: 20 } }]) {
    assert.equal(recovery.rhuRecoveryMatches({ visit, patientId: "7", draft: invalid }), false);
  }
});

test("discard deletes only the displayed draft at the displayed revision", async () => {
  const calls = [];
  await recovery.discardRhuRecovery({ visit, patientId: "7", owner: "owner", decision: { server: draft }, api: dependencies({
    discard: async (...args) => calls.push(args),
  }) });
  assert.deepEqual(calls, [["draft-1", 4, { draftOwnerContext: "owner" }]]);
});

test("discard refuses a newer revision, preserving concurrent clinical edits", async () => {
  let deleted = false;
  await assert.rejects(recovery.discardRhuRecovery({ visit, patientId: "7", owner: "owner", decision: { server: draft }, api: dependencies({
    lookup: async () => ({ ...draft, version: 5 }),
    discard: async () => { deleted = true; },
  }) }), /changed|review/i);
  assert.equal(deleted, false);
});

test("resume claims the loaded revision before handing its clinical inputs to the workspace", async () => {
  const result = await recovery.resumeRhuRecovery({ visit, patientId: "7", owner: "owner", decision: { server: draft }, api: dependencies({
    claim: async (id, version, options) => {
      assert.deepEqual([id, version, options], ["draft-1", 4, { draftOwnerContext: "owner" }]);
      return { ...draft, version: 5, payload: null };
    },
  }) });
  assert.equal(result.draft.version, 5);
  assert.equal(result.draft.payload.chiefComplaint, "Saved input");
});

test("discard uses the claimed revision and a failed claim never deletes input", async () => {
  let deleted = false;
  await assert.rejects(recovery.discardRhuRecovery({ visit, patientId: "7", owner: "owner", decision: { server: draft }, api: dependencies({
    claim: async () => { throw new Error("Version conflict"); },
    discard: async () => { deleted = true; },
  }) }), /Version conflict/);
  assert.equal(deleted, false);
  const calls = [];
  await recovery.discardRhuRecovery({ visit, patientId: "7", owner: "owner", decision: { server: draft }, api: dependencies({
    claim: async () => ({ version: 5 }), discard: async (...args) => calls.push(args),
  }) });
  assert.deepEqual(calls, [["draft-1", 5, { draftOwnerContext: "owner" }]]);
});
