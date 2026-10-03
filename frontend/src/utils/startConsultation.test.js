import test from "node:test";
import assert from "node:assert/strict";
import {
  hasMonitoredConditions,
  monitoredConditionOptions,
  selectionToRoute,
  startConsultationAction,
  startRoute,
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

test("the modal is only for a patient with an active monitoring record", () => {
  assert.equal(hasMonitoredConditions(null), false);
  assert.equal(hasMonitoredConditions({ pendingFollowUps: [], monitoringWithoutFollowUp: [] }), false);
  // A follow-up that links no monitoring record has nothing to select.
  assert.equal(hasMonitoredConditions({ pendingFollowUps: [{ id: 1, conditions: [] }], monitoringWithoutFollowUp: [] }), false);
  assert.equal(hasMonitoredConditions({ pendingFollowUps: [], monitoringWithoutFollowUp: [{ id: 7, conditionName: "Asthma" }] }), true);
  assert.equal(hasMonitoredConditions(overview), true);
});

test("starting with nothing selected is a normal consultation; a selection continues it", () => {
  assert.equal(startRoute({ patientId: 17 }), "/bhc/health-records/add?patientId=17&mode=new");
  assert.equal(startRoute({ patientId: 17, monitoringIds: [] }), "/bhc/health-records/add?patientId=17&mode=new");
  assert.equal(
    startRoute({ patientId: 17, monitoringIds: [4, 7] }),
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
  // No draft and monitored conditions to offer: open the modal (the hook's
  // needsStartModal is false whenever a draft exists, so Resume always wins).
  assert.equal(startConsultationAction({ ...ready, needsStartModal: true }), "modal");
  // A draft to resume: a plain link.
  assert.equal(startConsultationAction(ready), "link");
  assert.equal(startConsultationAction(), "disabled");
});
