import test from "node:test";
import assert from "node:assert/strict";

import {
  activeMonitoringsFromOverview,
  droppedContinuedCareNotice,
  keepStopsFor,
  resolveContinuedCare,
  tbPrefillRecordId,
  uniqueById,
} from "./continuedCare.js";
import { defaultCarePlan, CARE_PLAN } from "./carePlan.js";
import { restoreCarePlanDraft, continuedVisitLink } from "./carePlanWorkspace.js";

const registry = {
  monitored_conditions: {
    hypertension: { name: "Hypertension", aliases: ["HTN"] },
    tuberculosis: { name: "Tuberculosis", aliases: ["PTB"], monitoring_details: "tb_dots" },
  },
};

const overview = {
  pendingFollowUps: [
    {
      id: 1,
      dueDate: "2026-10-01",
      sourceHealthRecordId: 50,
      conditions: [{ monitoringId: 3, conditionName: "Hypertension" }],
    },
    // A follow-up with no linked monitored condition.
    { id: 2, dueDate: "2026-10-05", sourceHealthRecordId: 51, conditions: [] },
  ],
  monitoringWithoutFollowUp: [
    {
      id: 4,
      conditionName: "Asthma",
      conditionKey: null,
      startedAt: "2026-08-01",
      lastVisitDate: "2026-09-01",
      lastHealthRecordId: 40,
    },
    {
      id: 5,
      conditionName: "Tuberculosis",
      conditionKey: "tuberculosis",
      startedAt: "2026-07-01",
      lastHealthRecordId: 41,
    },
  ],
};

test("uniqueById keeps the first entry per id", () => {
  assert.deepEqual(uniqueById([{ id: 1, a: 1 }, { id: "1", a: 2 }, { id: 2 }]), [{ id: 1, a: 1 }, { id: 2 }]);
});

test("every active monitoring in the overview is listed once", () => {
  const active = activeMonitoringsFromOverview(overview);
  assert.deepEqual(active.map((m) => m.id), [4, 5, 3]);
  assert.deepEqual(active.find((m) => m.id === 3), {
    id: 3, conditionName: "Hypertension", conditionKey: null, startedAt: "", lastHealthRecordId: 50,
  });
  assert.deepEqual(activeMonitoringsFromOverview(null), []);
});

test("seeding from the modal continues the selected follow-ups' conditions too", () => {
  const result = resolveContinuedCare(overview, {
    followUpIds: [1, 2],
    monitoringIds: [4],
    includeFollowUpConditions: true,
  });
  assert.deepEqual(result.continuedFollowUpTaskIds, [1, 2]);
  assert.deepEqual(result.continuedFollowUps, [
    { id: 1, sourceHealthRecordId: 50 },
    { id: 2, sourceHealthRecordId: 51 },
  ]);
  assert.deepEqual(result.continuedMonitorings.map((m) => [m.id, m.conditionName]), [
    [3, "Hypertension"],
    [4, "Asthma"],
  ]);
  assert.deepEqual(result.droppedFollowUpIds, []);
  assert.deepEqual(result.droppedMonitoringIds, []);
  // The visit becomes a follow-up visit of the first follow-up's source ITR.
  assert.deepEqual(continuedVisitLink(result.continuedFollowUpTaskIds, result.continuedFollowUps), {
    visitType: "follow_up_visit",
    followUpTaskId: 1,
    parentHealthRecordId: 50,
  });
});

test("a follow-up without conditions is continued on its own", () => {
  const result = resolveContinuedCare(overview, { followUpIds: [2], includeFollowUpConditions: true });
  assert.deepEqual(result.continuedFollowUpTaskIds, [2]);
  assert.deepEqual(result.continuedMonitorings, []);
});

test("a resumed draft's placeholders are re-hydrated from the overview", () => {
  const restored = restoreCarePlanDraft({
    continuedFollowUpTaskIds: [1],
    continuedMonitoringIds: [3, 5],
    monitoringStops: [{ monitoringId: 5, reason: "Completed treatment" }],
  });
  assert.equal(restored.continuedMonitorings[0].conditionKey, null);
  const result = resolveContinuedCare(overview, {
    followUpIds: restored.continuedFollowUpTaskIds,
    monitoringIds: restored.continuedMonitorings.map((m) => m.id),
    stops: restored.monitoringStops,
  });
  assert.deepEqual(result.continuedFollowUps, [{ id: 1, sourceHealthRecordId: 50 }]);
  assert.deepEqual(result.continuedMonitorings.map((m) => [m.id, m.conditionName, m.conditionKey, m.startedAt]), [
    [3, "Hypertension", null, ""],
    [5, "Tuberculosis", "tuberculosis", "2026-07-01"],
  ]);
  assert.deepEqual(result.monitoringStops, { 5: "Completed treatment" });
  // A re-diagnosed continued condition defaults to Monitor again (HTN alias -> Hypertension name).
  assert.equal(defaultCarePlan({ name: "HTN" }, result.continuedMonitorings, registry), CARE_PLAN.MONITOR);
  assert.equal(defaultCarePlan({ name: "HTN" }, restored.continuedMonitorings, registry), CARE_PLAN.NONE);
});

test("ids no longer in the overview are dropped with their stops and reported", () => {
  const result = resolveContinuedCare(overview, {
    followUpIds: [1, 99],
    monitoringIds: [3, 77],
    stops: { 77: "Resolved", 3: "" },
  });
  assert.deepEqual(result.continuedFollowUpTaskIds, [1]);
  assert.deepEqual(result.continuedMonitorings.map((m) => m.id), [3]);
  assert.deepEqual(result.droppedFollowUpIds, [99]);
  assert.deepEqual(result.droppedMonitoringIds, [77]);
  assert.deepEqual(result.monitoringStops, { 3: "" });
  assert.equal(
    droppedContinuedCareNotice(result),
    "1 follow-up and 1 monitored condition are no longer active (already completed or stopped) and were removed from Care Plan.",
  );
  assert.equal(
    droppedContinuedCareNotice({ droppedFollowUpIds: [], droppedMonitoringIds: [7] }),
    "1 monitored condition is no longer active (already completed or stopped) and was removed from Care Plan.",
  );
  assert.equal(droppedContinuedCareNotice({ droppedFollowUpIds: [], droppedMonitoringIds: [] }), "");
});

test("an empty overview drops every continued id and reports each one", () => {
  const result = resolveContinuedCare(
    { pendingFollowUps: [], monitoringWithoutFollowUp: [] },
    { followUpIds: [1], monitoringIds: [3] },
  );
  assert.deepEqual(result.droppedFollowUpIds, [1]);
  assert.deepEqual(result.droppedMonitoringIds, [3]);
});

test("TB-DOTS prefill comes from the continued TB monitoring's last ITR", () => {
  const seeded = resolveContinuedCare(overview, { monitoringIds: [4, 5] }).continuedMonitorings;
  assert.equal(tbPrefillRecordId(seeded, registry), 41);
  // A follow-up condition has no key; the registry name identifies it.
  const fromFollowUp = [{ id: 9, conditionName: "Tuberculosis", conditionKey: null, lastHealthRecordId: 60 }];
  assert.equal(tbPrefillRecordId(fromFollowUp, registry), 60);
  assert.equal(tbPrefillRecordId([{ id: 4, conditionName: "Asthma", lastHealthRecordId: 40 }], registry), null);
});

test("stops are kept only for continued monitoring", () => {
  assert.deepEqual(keepStopsFor({ 3: "Resolved", "8": "Moved away" }, [{ id: 3 }]), { 3: "Resolved" });
  assert.deepEqual(keepStopsFor(undefined, []), {});
});
