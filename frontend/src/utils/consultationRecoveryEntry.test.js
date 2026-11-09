import test from "node:test";
import assert from "node:assert/strict";
import { consultationRecoveryEntry, consultationRecoveryPath, prepareConsultationRecovery, validConsultationHandoff } from "./consultationRecoveryEntry.js";

const server = { id: "draft-id", consultationUuid: "uuid-1", patient: { id: "7" } };
const local = { consultationKey: "consultation:uuid-1", record: { draft: { ...server, payload: { chiefComplaint: "Private input" } } } };
test("Start checks only the selected patient's unfinished transaction before opening its selection modal", () => {
  assert.equal(consultationRecoveryEntry({ patientId: "8", server: [server], device: [local] }), null);
  const entry = consultationRecoveryEntry({ patientId: "7", server: [server], device: [local] });
  assert.equal(entry.server.id, "draft-id");
  assert.equal(entry.local.consultationKey, "consultation:uuid-1");
  assert.equal(consultationRecoveryEntry({ patientId: "7", server: [], device: [] }), null);
});
test("legacy duplicate consultations need review rather than silently selecting one or starting another", () => {
  assert.throws(() => consultationRecoveryEntry({ patientId: "7", server: [server, { ...server, id: "other", consultationUuid: "uuid-2" }], device: [] }), /multiple unfinished consultations/i);
});
test("Resume navigates with opaque identifiers and never places clinical input in history or the URL", () => {
  const path = consultationRecoveryPath("7", { local, server });
  assert.match(path, /recoveryUuid=uuid-1/);
  assert.doesNotMatch(path, /Private|chiefComplaint|payload/);
  assert.match(consultationRecoveryPath("7", { server }), /draftId=draft-id/);
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
  for (const change of [{ owner: "other" }, { patientId: "8" }, { draftId: "other" }, { now: 61_000 }, { now: 0 }]) assert.equal(validConsultationHandoff(entry, { ...context, ...change }), false);
});
