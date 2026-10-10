import test from "node:test";
import assert from "node:assert/strict";
import {
  checkContinuedStart,
  hasStartChoices,
  legacyMonitoringOptions,
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
  assert.equal(hasStartChoices(null), false);
  assert.equal(hasStartChoices({ pendingFollowUps: [], monitoringWithoutFollowUp: [] }), false);
  // A follow-up that links no monitoring record has nothing to select.
  assert.equal(hasStartChoices({ pendingFollowUps: [{ id: 1, conditions: [] }], monitoringWithoutFollowUp: [] }), false);
  assert.equal(hasStartChoices({ pendingFollowUps: [], monitoringWithoutFollowUp: [{ id: 7, conditionName: "Asthma" }] }), true);
  assert.equal(hasStartChoices(overview), true);
});

test("a monitoring recommendation alone is a start choice", () => {
  const recommended = {
    pendingFollowUps: [],
    monitoringWithoutFollowUp: [],
    monitoringRecommendations: [{ conditionId: 9, conditionName: "Hypertension", status: "active" }],
  };
  assert.equal(hasStartChoices(recommended), true);
  assert.equal(hasStartChoices({ ...recommended, monitoringRecommendations: [] }), false);
});

test("starting with nothing selected is a normal consultation; a selection continues it", () => {
  assert.equal(startRoute({ patientId: 17 }), "/bhc/health-records/add?patientId=17&mode=new");
  assert.equal(startRoute({ patientId: 17, monitoringIds: [] }), "/bhc/health-records/add?patientId=17&mode=new");
  assert.equal(
    startRoute({ patientId: 17, monitoringIds: [4, 7] }),
    "/bhc/health-records/add?patientId=17&mode=continue&monitoringIds=4%2C7",
  );
});

test("starting recommended conditions continues the consultation with their ids", () => {
  assert.equal(
    startRoute({ patientId: 17, startConditionIds: [9, 10] }),
    "/bhc/health-records/add?patientId=17&mode=continue&startConditionIds=9%2C10",
  );
  assert.equal(
    startRoute({ patientId: 17, monitoringIds: [4], startConditionIds: [9] }),
    "/bhc/health-records/add?patientId=17&mode=continue&monitoringIds=4&startConditionIds=9",
  );
  assert.equal(startRoute({ patientId: 17, startConditionIds: [] }), "/bhc/health-records/add?patientId=17&mode=new");
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

test("a selection is checked against the fresh overview before the workspace opens", () => {
  assert.deepEqual(checkContinuedStart(overview, [4, 7]), { ok: true, droppedMonitoringIds: [], droppedConditionIds: [] });
  assert.deepEqual(checkContinuedStart(overview, []), { ok: true, droppedMonitoringIds: [], droppedConditionIds: [] });
  // One stopped or completed elsewhere is reported, never silently dropped.
  assert.deepEqual(checkContinuedStart(overview, [4, 99]), { ok: false, droppedMonitoringIds: [99], droppedConditionIds: [] });
  assert.deepEqual(checkContinuedStart(null, [4]), { ok: false, droppedMonitoringIds: [4], droppedConditionIds: [] });
});

test("a dropped recommendation is reported, not silently removed", () => {
  assert.deepEqual(checkContinuedStart({ monitoringRecommendations: [] }, [], [9]).droppedConditionIds, [9]);
  const withRecommendation = { monitoringRecommendations: [{ conditionId: 9, conditionName: "Hypertension" }] };
  assert.deepEqual(checkContinuedStart(withRecommendation, [], [9]), {
    ok: true,
    droppedMonitoringIds: [],
    droppedConditionIds: [],
  });
  assert.deepEqual(checkContinuedStart(withRecommendation, [], [9, 10]), {
    ok: false,
    droppedMonitoringIds: [],
    droppedConditionIds: [10],
  });
});

const withLegacy = {
  pendingFollowUps: [
    {
      id: 21, dueDate: "2026-10-03", isOverdue: false, sourceHealthRecordId: 92,
      conditions: [
        { monitoringId: 4, conditionName: "Hypertension", legacy: false },
        { monitoringId: 8, conditionName: "Gout", legacy: true },
      ],
    },
  ],
  monitoringWithoutFollowUp: [
    { id: 7, conditionName: "Asthma", startedAt: "2026-01-02", legacy: false },
    { id: 9, conditionName: "Arthritis", startedAt: "2026-02-03", legacy: true },
  ],
};

test("monitoredConditionOptions excludes legacy rows", () => {
  assert.deepEqual(monitoredConditionOptions(withLegacy).map((o) => o.monitoringId), [7, 4]);
});

test("legacyMonitoringOptions lists only legacy rows", () => {
  assert.deepEqual(legacyMonitoringOptions(withLegacy), [
    { monitoringId: 9, conditionName: "Arthritis", startedAt: "2026-02-03" },
    { monitoringId: 8, conditionName: "Gout", startedAt: "" },
  ]);
  assert.deepEqual(legacyMonitoringOptions(overview), []);
  assert.deepEqual(legacyMonitoringOptions(null), []);
});

test("a patient with only legacy monitoring has no start choices, so consultation is never blocked", () => {
  const onlyLegacy = { pendingFollowUps: [], monitoringWithoutFollowUp: [{ id: 9, conditionName: "Arthritis", legacy: true }] };
  assert.equal(hasStartChoices(onlyLegacy), false);
});
