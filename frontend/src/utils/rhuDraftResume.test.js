import assert from "node:assert/strict";
import test from "node:test";
import { hydrateRhuConsultationDraft } from "./rhuDraftResume.js";

test("hydrate loads an existing visit draft for an explicit Resume decision", async () => {
  const events = [];
  const draft = {
    id: "draft-1",
    version: 2,
    consultationUuid: "uuid-1",
    payload: { chiefComplaint: "hypertension test", summaryOfPresentIllness: "sada" },
  };
  const result = await hydrateRhuConsultationDraft({
    patientId: "7",
    visitId: 19,
    lookup: async ({ patientId, rhuVisitId }) => {
      events.push(`lookup:${patientId}:${rhuVisitId}`);
      return { id: "draft-1", consultationUuid: "uuid-1" };
    },
    load: async (id) => {
      events.push(`load:${id}`);
      return draft;
    },
    isCancelled: () => false,
  });
  assert.deepEqual(events, ["lookup:7:19", "load:draft-1"]);
  assert.equal(result.restored, true);
  assert.equal(result.draft.payload.chiefComplaint, "hypertension test");
});

test("hydrate stays blank when the visit has no server draft yet", async () => {
  const events = [];
  const result = await hydrateRhuConsultationDraft({
    patientId: "7",
    visitId: 19,
    lookup: async () => null,
    load: async () => { throw new Error("should not load"); },
    restore: () => { events.push("restore"); },
    isCancelled: () => false,
  });
  assert.deepEqual(events, []);
  assert.equal(result.restored, false);
  assert.equal(result.draft, null);
});

test("hydrate ignores a late response after cancellation", async () => {
  const events = [];
  let cancelled = false;
  const pending = hydrateRhuConsultationDraft({
    patientId: "7",
    visitId: 19,
    lookup: async () => ({ id: "draft-1" }),
    load: async () => {
      cancelled = true;
      return { id: "draft-1", payload: { chiefComplaint: "stale" } };
    },
    restore: () => { events.push("restore"); },
    isCancelled: () => cancelled,
  });
  const result = await pending;
  assert.deepEqual(events, []);
  assert.equal(result.cancelled, true);
  assert.equal(result.restored, false);
});
