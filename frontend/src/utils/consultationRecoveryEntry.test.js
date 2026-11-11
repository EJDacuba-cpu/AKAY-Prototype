import test from "node:test";
import assert from "node:assert/strict";
import {
  consultationRecoveryEntry,
  consultationRecoveryPath,
  prepareConsultationRecovery,
  takeoverConsultationRecovery,
  discardConsultationRecovery,
  validConsultationHandoff,
} from "./consultationRecoveryEntry.js";

const server = { id: "draft-id", consultationUuid: "uuid-1", patient: { id: "7" }, version: 3, canEdit: true };

test("Start checks only the selected patient's unfinished server draft", () => {
  assert.equal(consultationRecoveryEntry({ patientId: "8", server: [server] }), null);
  const entry = consultationRecoveryEntry({ patientId: "7", server: [server] });
  assert.equal(entry.server.id, "draft-id");
  assert.equal(entry.local, null);
  assert.equal(consultationRecoveryEntry({ patientId: "7", server: [] }), null);
});

test("legacy duplicate consultations need review rather than silently selecting one or starting another", () => {
  assert.throws(() => consultationRecoveryEntry({
    patientId: "7",
    server: [server, { ...server, id: "other", consultationUuid: "uuid-2" }],
  }), /multiple unfinished consultations/i);
});

test("Resume navigates with opaque identifiers and never places clinical input in history or the URL", () => {
  const path = consultationRecoveryPath("7", { server });
  assert.match(path, /draftId=draft-id/);
  assert.doesNotMatch(path, /Private|chiefComplaint|payload/);
});

test("BHC entry loads and claims the saved revision before handing off clinical input", async () => {
  const draft = { ...server, version: 3, payload: { chiefComplaint: "Saved input" }, medicineSelections: [] };
  const result = await prepareConsultationRecovery({
    patientId: "7", entry: { server: draft },
    lookup: async () => draft, load: async () => draft,
    claim: async (id, version) => { assert.deepEqual([id, version], ["draft-id", 3]); return { version: 4, payload: null }; },
  });
  assert.equal(result.draft.version, 4);
  assert.equal(result.draft.consultationUuid, "uuid-1");
  assert.equal(result.draft.payload.chiefComplaint, "Saved input");
});

test("BHC entry rejects a replacement draft and preserves failures instead of starting fresh", async () => {
  await assert.rejects(prepareConsultationRecovery({
    patientId: "7", entry: { server }, lookup: async () => ({ ...server, id: "other" }),
  }), /changed/);
  await assert.rejects(prepareConsultationRecovery({
    patientId: "7", entry: { server }, lookup: async () => { throw new Error("Offline"); },
  }), /Offline/);
});

test("BHC handoff is bound to actor, patient, draft route and a short in-memory lifetime", () => {
  const entry = { owner: "owner", patientId: "7", createdAt: 1000, draft: server };
  const context = { owner: "owner", patientId: "7", draftId: "draft-id", now: 2000 };
  assert.equal(validConsultationHandoff(entry, context), true);
  for (const change of [{ owner: "other" }, { patientId: "8" }, { draftId: "other" }, { now: 61_000 }, { now: 0 }]) {
    assert.equal(validConsultationHandoff(entry, { ...context, ...change }), false);
  }
});

test("BHC resume refuses an active foreign editor lease without claiming", async () => {
  let claimed = false;
  const occupied = {
    ...server,
    editor: { id: "9", name: "Jane Midwife" },
    editorExpiresAt: "2099-01-01T00:00:00.000Z",
  };
  await assert.rejects(prepareConsultationRecovery({
    patientId: "7",
    entry: { server: occupied },
    currentUserId: "3",
    lookup: async () => occupied,
    load: async () => occupied,
    claim: async () => { claimed = true; return occupied; },
  }), (error) => error?.code === "EDITOR_LEASE_OCCUPIED");
  assert.equal(claimed, false);
});

test("BHC takeover requires a reason and uses the takeover transition", async () => {
  const draft = { ...server, payload: { chiefComplaint: "Saved input" } };
  await assert.rejects(takeoverConsultationRecovery({
    patientId: "7", entry: { server: draft }, note: " ", lookup: async () => draft, load: async () => draft,
    takeover: async () => draft,
  }), /reason/i);
  const calls = [];
  const result = await takeoverConsultationRecovery({
    patientId: "7",
    entry: { server: draft },
    note: "Covering the rest of the interview",
    lookup: async () => draft,
    load: async () => draft,
    takeover: async (id, version, note) => {
      calls.push([id, version, note]);
      return { ...draft, version: 4, payload: null };
    },
  });
  assert.deepEqual(calls, [["draft-id", 3, "Covering the rest of the interview"]]);
  assert.equal(result.draft.version, 4);
  assert.equal(result.draft.payload.chiefComplaint, "Saved input");
});

test("BHC discard refuses occupied leases and version changes before deleting", async () => {
  let deleted = false;
  const occupied = {
    ...server,
    editor: { id: "9", name: "Jane Midwife" },
    editorExpiresAt: "2099-01-01T00:00:00.000Z",
  };
  await assert.rejects(discardConsultationRecovery({
    patientId: "7",
    entry: { server: occupied },
    currentUserId: "3",
    lookup: async () => occupied,
    claim: async () => occupied,
    discard: async () => { deleted = true; },
  }), (error) => error?.code === "EDITOR_LEASE_OCCUPIED");
  assert.equal(deleted, false);
  await assert.rejects(discardConsultationRecovery({
    patientId: "7",
    entry: { server },
    currentUserId: "3",
    lookup: async () => ({ ...server, version: 9 }),
    discard: async () => { deleted = true; },
  }), /changed/i);
  assert.equal(deleted, false);
});
