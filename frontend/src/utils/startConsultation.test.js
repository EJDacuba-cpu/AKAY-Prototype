import test from "node:test";
import assert from "node:assert/strict";
import {
  checkContinuedStart,
  hasStartChoices,
  legacyMonitoringOptions,
  monitoredConditionOptions,
  scheduledFollowUpOptions,
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

test("the modal is for a patient with monitoring, a recommendation, a scheduled follow-up or a legacy row", () => {
  assert.equal(hasStartChoices(null), false);
  assert.equal(hasStartChoices({ pendingFollowUps: [], monitoringWithoutFollowUp: [] }), false);
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
  assert.deepEqual(checkContinuedStart(overview, [4, 7]), { ok: true, droppedMonitoringIds: [], droppedConditionIds: [], droppedFollowUpIds: [] });
  assert.deepEqual(checkContinuedStart(overview, []), { ok: true, droppedMonitoringIds: [], droppedConditionIds: [], droppedFollowUpIds: [] });
  // One stopped or completed elsewhere is reported, never silently dropped.
  assert.deepEqual(checkContinuedStart(overview, [4, 99]), { ok: false, droppedMonitoringIds: [99], droppedConditionIds: [], droppedFollowUpIds: [] });
  assert.deepEqual(checkContinuedStart(null, [4]), { ok: false, droppedMonitoringIds: [4], droppedConditionIds: [], droppedFollowUpIds: [] });
});

test("a dropped recommendation is reported, not silently removed", () => {
  assert.deepEqual(checkContinuedStart({ monitoringRecommendations: [] }, [], [9]).droppedConditionIds, [9]);
  const withRecommendation = { monitoringRecommendations: [{ conditionId: 9, conditionName: "Hypertension" }] };
  assert.deepEqual(checkContinuedStart(withRecommendation, [], [9]), {
    ok: true,
    droppedMonitoringIds: [],
    droppedConditionIds: [],
    droppedFollowUpIds: [],
  });
  assert.deepEqual(checkContinuedStart(withRecommendation, [], [9, 10]), {
    ok: false,
    droppedMonitoringIds: [],
    droppedConditionIds: [10],
    droppedFollowUpIds: [],
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

test("a patient with only legacy monitoring still sees the modal, to read the pending-verification list", () => {
  const onlyLegacy = { pendingFollowUps: [], monitoringWithoutFollowUp: [{ id: 9, conditionName: "Arthritis", legacy: true }] };
  assert.equal(hasStartChoices(onlyLegacy), true);
});

const concernTask = {
  id: 31, dueDate: "2026-10-12", isOverdue: true, reason: "Wound check", sourceHealthRecordId: 95, sourceDate: "2026-10-05",
  conditions: [],
};
const legacyOnlyTask = {
  id: 32, dueDate: "2026-10-15", isOverdue: false, reason: "Gout review", sourceHealthRecordId: 96, sourceDate: "2026-10-06",
  conditions: [{ monitoringId: 8, conditionName: "Gout", legacy: true }],
};
const verifiedTask = {
  id: 33, dueDate: "2026-10-20", isOverdue: false, reason: "BP recheck", sourceHealthRecordId: 97, sourceDate: "2026-10-07",
  conditions: [{ monitoringId: 4, conditionName: "Hypertension", legacy: false }],
};
const mixedTask = {
  id: 34, dueDate: "2026-10-21", isOverdue: false, reason: "", sourceHealthRecordId: 98, sourceDate: "2026-10-07",
  conditions: [
    { monitoringId: 4, conditionName: "Hypertension", legacy: false },
    { monitoringId: 8, conditionName: "Gout", legacy: true },
  ],
};

test("scheduledFollowUpOptions lists concern follow-ups and legacy-only follow-ups, not verified-monitoring ones", () => {
  const withTasks = { pendingFollowUps: [verifiedTask, legacyOnlyTask, concernTask, mixedTask], monitoringWithoutFollowUp: [] };
  assert.deepEqual(scheduledFollowUpOptions(withTasks), [
    { followUpId: 31, reason: "Wound check", dueDate: "2026-10-12", isOverdue: true, sourceDate: "2026-10-05" },
    { followUpId: 32, reason: "Gout review", dueDate: "2026-10-15", isOverdue: false, sourceDate: "2026-10-06" },
  ]);
  assert.deepEqual(scheduledFollowUpOptions(null), []);
  assert.deepEqual(scheduledFollowUpOptions({ pendingFollowUps: [], monitoringWithoutFollowUp: [] }), []);
});

test("scheduledFollowUpOptions is ordered by due date", () => {
  const later = { ...concernTask, id: 35, dueDate: "2026-10-30" };
  const earlier = { ...concernTask, id: 36, dueDate: "2026-10-02" };
  assert.deepEqual(
    scheduledFollowUpOptions({ pendingFollowUps: [later, earlier] }).map((o) => o.followUpId),
    [36, 35],
  );
});

test("hasStartChoices is true for a pending concern follow-up alone", () => {
  assert.equal(hasStartChoices({ pendingFollowUps: [concernTask], monitoringWithoutFollowUp: [] }), true);
  assert.equal(hasStartChoices({ pendingFollowUps: [legacyOnlyTask], monitoringWithoutFollowUp: [] }), true);
});

test("hasStartChoices is false for a first-visit patient", () => {
  assert.equal(hasStartChoices({ pendingFollowUps: [], monitoringWithoutFollowUp: [], monitoringRecommendations: [] }), false);
  assert.equal(hasStartChoices({}), false);
});

test("startRoute carries followUpIds", () => {
  assert.equal(
    startRoute({ patientId: 17, followUpIds: [31] }),
    "/bhc/health-records/add?patientId=17&mode=continue&followUpIds=31",
  );
  assert.equal(
    startRoute({ patientId: 17, followUpIds: [31, 32], monitoringIds: [4] }),
    "/bhc/health-records/add?patientId=17&mode=continue&followUpIds=31%2C32&monitoringIds=4",
  );
  assert.equal(startRoute({ patientId: 17, followUpIds: [] }), "/bhc/health-records/add?patientId=17&mode=new");
});

test("checkContinuedStart reports a fulfilled follow-up as dropped", () => {
  const fresh = { pendingFollowUps: [concernTask], monitoringWithoutFollowUp: [] };
  assert.deepEqual(checkContinuedStart(fresh, [], [], [31]), {
    ok: true,
    droppedMonitoringIds: [],
    droppedConditionIds: [],
    droppedFollowUpIds: [],
  });
  assert.deepEqual(checkContinuedStart(fresh, [], [], [31, 99]), {
    ok: false,
    droppedMonitoringIds: [],
    droppedConditionIds: [],
    droppedFollowUpIds: [99],
  });
});
