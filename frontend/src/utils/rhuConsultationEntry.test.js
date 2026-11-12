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

test("editor lease occupancy ignores same-user and expired leases", () => {
  const now = Date.parse("2026-11-12T01:00:00.000Z");
  const activeOther = {
    canEdit: true,
    editor: { id: "9", name: "Jane Midwife" },
    editorExpiresAt: "2026-11-12T01:10:00.000Z",
  };
  assert.deepEqual(recovery.consultationEditorLease(activeOther, "3", now), {
    occupied: true,
    sameUser: false,
    canTakeover: true,
    editorId: "9",
    editorName: "Jane Midwife",
  });
  assert.equal(recovery.consultationEditorLease(activeOther, "9", now).occupied, false);
  assert.equal(recovery.consultationEditorLease(activeOther, "9", now).sameUser, true);
  assert.equal(recovery.consultationEditorLease({
    ...activeOther,
    editorExpiresAt: "2026-11-12T00:59:00.000Z",
  }, "3", now).occupied, false);
  assert.equal(recovery.consultationEditorLease({
    ...activeOther,
    canEdit: false,
  }, "3", now).canTakeover, false);
});

test("resume refuses an active foreign editor lease without claiming", async () => {
  let claimed = false;
  await assert.rejects(recovery.resumeRhuRecovery({
    visit,
    patientId: "7",
    owner: "owner",
    currentUserId: "3",
    decision: { server: draft },
    api: dependencies({
      lookup: async () => ({
        ...draft,
        canEdit: true,
        editor: { id: "9", name: "Jane Midwife" },
        editorExpiresAt: "2099-01-01T00:00:00.000Z",
      }),
      claim: async () => { claimed = true; return draft; },
    }),
  }), (error) => error?.code === "EDITOR_LEASE_OCCUPIED" && /Jane Midwife/.test(error.message));
  assert.equal(claimed, false);
});

test("takeover requires a reason and claims through the takeover transition", async () => {
  await assert.rejects(recovery.takeoverRhuRecovery({
    visit, patientId: "7", owner: "owner", decision: { server: draft }, note: "  ", api: dependencies(),
  }), /reason/i);
  const calls = [];
  const result = await recovery.takeoverRhuRecovery({
    visit,
    patientId: "7",
    owner: "owner",
    decision: { server: draft },
    note: "Covering the rest of the interview",
    api: dependencies({
      takeover: async (id, version, note, options) => {
        calls.push([id, version, note, options]);
        return { ...draft, version: 5, payload: null };
      },
      claim: async () => { throw new Error("takeover must not claim"); },
    }),
  });
  assert.deepEqual(calls, [["draft-1", 4, "Covering the rest of the interview", { draftOwnerContext: "owner" }]]);
  assert.equal(result.draft.version, 5);
  assert.equal(result.draft.payload.chiefComplaint, "Saved input");
});
