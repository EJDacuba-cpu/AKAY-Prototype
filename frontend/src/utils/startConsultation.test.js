import test from "node:test";
import assert from "node:assert/strict";
import {
  VISIT_CONTEXT,
  canStartVisit,
  monitoredConditionOptions,
  selectionToRoute,
  startConsultationAction,
  visitContextToRoute,
} from "./startConsultation.js";

const overview = {
  pendingFollowUps: [
    {
      id: 11, dueDate: "2026-10-01", isOverdue: true, sourceHealthRecordId: 90,
      conditions: [{ monitoringId: 4, conditionName: "Hypertension" }, { monitoringId: 5, conditionName: "Diabetes Mellitus" }],
    },
    {
      id: 12, dueDate: "2026-10-20", isOverdue: false, sourceHealthRecordId: 91,
      conditions: [{ monitoringId: 4, conditionName: "Hypertension" }],
    },
  ],
  monitoringWithoutFollowUp: [{ id: 7, conditionName: "Asthma", startedAt: "2026-01-02" }],
};

test("lists each active monitoring once, alphabetically, with its earliest follow-up", () => {
  assert.deepEqual(
    monitoredConditionOptions(overview).map((o) => [o.monitoringId, o.conditionName, o.followUp?.dueDate ?? null]),
    [[7, "Asthma", null], [5, "Diabetes Mellitus", "2026-10-01"], [4, "Hypertension", "2026-10-01"]],
  );
  assert.equal(monitoredConditionOptions(overview).find((o) => o.monitoringId === 4).followUp.isOverdue, true);
  assert.deepEqual(monitoredConditionOptions(null), []);
  assert.deepEqual(monitoredConditionOptions({ pendingFollowUps: [], monitoringWithoutFollowUp: [] }), []);
});

test("follow-up needs a condition; general never does; no context cannot start", () => {
  assert.equal(canStartVisit(VISIT_CONTEXT.GENERAL, []), true);
  assert.equal(canStartVisit(VISIT_CONTEXT.MONITORING, []), false);
  assert.equal(canStartVisit(VISIT_CONTEXT.MONITORING, [4]), true);
  assert.equal(canStartVisit(null, [4]), false);
});

test("visit context becomes a route; general drops any ticked ids", () => {
  assert.equal(
    visitContextToRoute({ patientId: 17, context: VISIT_CONTEXT.GENERAL, monitoringIds: [4] }),
    "/bhc/health-records/add?patientId=17&mode=new",
  );
  assert.equal(
    visitContextToRoute({ patientId: 17, context: VISIT_CONTEXT.MONITORING, monitoringIds: [4, 7] }),
    "/bhc/health-records/add?patientId=17&mode=continue&monitoringIds=4%2C7",
  );
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
