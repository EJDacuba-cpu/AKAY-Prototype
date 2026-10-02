import test from "node:test";
import assert from "node:assert/strict";
import { needsStartModal, selectionToRoute, startConsultationAction } from "./startConsultation.js";

test("the modal is skipped when nothing is pending or monitored", () => {
  assert.equal(needsStartModal({ pendingFollowUps: [], monitoringWithoutFollowUp: [] }), false);
  assert.equal(needsStartModal(null), false);
  assert.equal(needsStartModal({ pendingFollowUps: [{ id: 1 }], monitoringWithoutFollowUp: [] }), true);
  assert.equal(needsStartModal({ pendingFollowUps: [], monitoringWithoutFollowUp: [{ id: 4 }] }), true);
});

test("a selection becomes a continue route", () => {
  assert.equal(
    selectionToRoute({ patientId: 17, followUpIds: [1, 2], monitoringIds: [4] }),
    "/bhc/health-records/add?patientId=17&mode=continue&followUpIds=1%2C2&monitoringIds=4",
  );
});

test("a single follow-up continue route omits empty monitoring", () => {
  assert.equal(
    selectionToRoute({ patientId: 17, followUpIds: [9] }),
    "/bhc/health-records/add?patientId=17&mode=continue&followUpIds=9",
  );
});

test("what a Start Consultation action does: wait, open the modal, or go", () => {
  const ready = { isPending: false, isError: false, discarding: false, needsStartModal: false };
  assert.equal(startConsultationAction({ ...ready, isPending: true }), "disabled");
  assert.equal(startConsultationAction({ ...ready, isError: true }), "disabled");
  assert.equal(startConsultationAction({ ...ready, discarding: true }), "disabled");
  // Something to continue (and no draft - the hook's needsStartModal is false
  // whenever a draft exists, so Resume always wins): open the modal.
  assert.equal(startConsultationAction({ ...ready, needsStartModal: true }), "modal");
  // A draft to resume, or nothing to continue: a plain link.
  assert.equal(startConsultationAction(ready), "link");
  assert.equal(startConsultationAction(), "disabled");
});
