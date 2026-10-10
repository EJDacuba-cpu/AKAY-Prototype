import test from "node:test";
import assert from "node:assert/strict";

import {
  activeMonitoringsFromOverview,
  droppedContinuedCareNotice,
  keepStopsFor,
  removeContinuedFollowUp,
  resolveContinuedCare,
  tbPrefillRecordId,
  uniqueById,
} from "./continuedCare.js";
import { monitoredConditionKeys } from "./carePlan.js";
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
    conditionStatus: null, legacy: false,
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
    { id: 1, sourceHealthRecordId: 50, reason: "", dueDate: "2026-10-01", sourceDate: "" },
    { id: 2, sourceHealthRecordId: 51, reason: "", dueDate: "2026-10-05", sourceDate: "" },
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
  assert.deepEqual(result.continuedFollowUps, [
    { id: 1, sourceHealthRecordId: 50, reason: "", dueDate: "2026-10-01", sourceDate: "" },
  ]);
  assert.deepEqual(result.continuedMonitorings.map((m) => [m.id, m.conditionName, m.conditionKey, m.startedAt]), [
    [3, "Hypertension", null, ""],
    [5, "Tuberculosis", "tuberculosis", "2026-07-01"],
  ]);
  assert.deepEqual(result.monitoringStops, { 5: "Completed treatment" });
  // A hydrated row without a stored key is still keyed by its registry name; the placeholder is not.
  assert.deepEqual(monitoredConditionKeys(result.continuedMonitorings, [], {}, registry), ["hypertension", "tuberculosis"]);
  assert.deepEqual(monitoredConditionKeys(restored.continuedMonitorings, [], {}, registry), [null, null]);
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

test("a continued monitoring carries the RHU status and the legacy flag from the overview", () => {
  const withStatus = {
    pendingFollowUps: [
      {
        id: 1, dueDate: "2026-10-01", sourceHealthRecordId: 50,
        conditions: [{ monitoringId: 3, conditionName: "Hypertension", conditionStatus: "Controlled", legacy: false }],
      },
    ],
    monitoringWithoutFollowUp: [
      { id: 4, conditionName: "Asthma", conditionKey: null, conditionStatus: null, legacy: true },
      { id: 5, conditionName: "Diabetes", conditionKey: null, conditionStatus: "Resolved", legacy: false },
    ],
  };
  const result = resolveContinuedCare(withStatus, { followUpIds: [1], monitoringIds: [4, 5], includeFollowUpConditions: true });
  assert.deepEqual(result.continuedMonitorings.map((m) => [m.id, m.conditionStatus, m.legacy]), [
    [3, "Controlled", false],
    [4, null, true],
    [5, "Resolved", false],
  ]);
});

test("a withdrawn RHU recommendation is reported in the notice, never silently dropped", () => {
  assert.equal(
    droppedContinuedCareNotice({ droppedFollowUpIds: [], droppedMonitoringIds: [], droppedConditionIds: [8] }),
    "1 RHU-recommended condition is no longer recommended for BHC monitoring and was removed from Care Plan.",
  );
  assert.equal(
    droppedContinuedCareNotice({ droppedFollowUpIds: [], droppedMonitoringIds: [], droppedConditionIds: [8, 9] }),
    "2 RHU-recommended conditions are no longer recommended for BHC monitoring and were removed from Care Plan.",
  );
  assert.equal(
    droppedContinuedCareNotice({ droppedFollowUpIds: [], droppedMonitoringIds: [7], droppedConditionIds: [8] }),
    "1 monitored condition is no longer active (already completed or stopped) and was removed from Care Plan. " +
      "1 RHU-recommended condition is no longer recommended for BHC monitoring and was removed from Care Plan.",
  );
  const result = resolveContinuedCare(overview, { startConditionIds: [8] });
  assert.deepEqual(result.droppedConditionIds, [8]);
  assert.match(droppedContinuedCareNotice(result), /no longer recommended for BHC monitoring/);
});

test("stops are kept only for continued monitoring", () => {
  assert.deepEqual(keepStopsFor({ 3: "Resolved", "8": "Moved away" }, [{ id: 3 }]), { 3: "Resolved" });
  assert.deepEqual(keepStopsFor(undefined, []), {});
});

const linkedOverview = {
  pendingFollowUps: [
    {
      id: 11, dueDate: "2026-10-01", sourceHealthRecordId: 90,
      conditions: [{ monitoringId: 4, conditionName: "Hypertension" }, { monitoringId: 5, conditionName: "Diabetes Mellitus" }],
    },
    { id: 12, dueDate: "2026-10-20", sourceHealthRecordId: 91, conditions: [{ monitoringId: 4, conditionName: "Hypertension" }] },
  ],
  monitoringWithoutFollowUp: [],
};

test("linked follow-ups of selected monitoring are continued without their other conditions", () => {
  const r = resolveContinuedCare(linkedOverview, { monitoringIds: [4], includeFollowUpConditions: true, includeLinkedFollowUps: true });
  assert.deepEqual(r.continuedFollowUpTaskIds, [11, 12]);
  assert.deepEqual(r.continuedMonitorings.map((m) => m.id), [4]);
});

test("Record Visit (follow-up ids only) still continues the follow-up's conditions", () => {
  const r = resolveContinuedCare(linkedOverview, { followUpIds: [11], includeFollowUpConditions: true, includeLinkedFollowUps: true });
  assert.deepEqual(r.continuedFollowUpTaskIds, [11]);
  assert.deepEqual(r.continuedMonitorings.map((m) => m.id).sort(), [4, 5]);
});

test("a selected monitoring that is no longer active is dropped with its links", () => {
  const r = resolveContinuedCare(linkedOverview, { monitoringIds: [99], includeLinkedFollowUps: true });
  assert.deepEqual(r.continuedFollowUpTaskIds, []);
  assert.deepEqual(r.droppedMonitoringIds, [99]);
});

test("without includeLinkedFollowUps a monitoring selection continues no follow-up", () => {
  const r = resolveContinuedCare(linkedOverview, { monitoringIds: [4] });
  assert.deepEqual(r.continuedFollowUpTaskIds, []);
});

const recommendedOverview = {
  pendingFollowUps: [],
  monitoringWithoutFollowUp: [],
  monitoringRecommendations: [
    { conditionId: 9, conditionName: "Hypertension", conditionKey: "hypertension", status: "active", confirmedAt: "2026-10-01", recommendedAt: "2026-10-02" },
  ],
};

test("recommended conditions to start are resolved against the overview", () => {
  const r = resolveContinuedCare(recommendedOverview, { startConditionIds: [9] });
  assert.deepEqual(r.startingConditions.map((c) => [c.conditionId, c.conditionName]), [[9, "Hypertension"]]);
  assert.deepEqual(r.droppedConditionIds, []);
  assert.deepEqual(r.continuedMonitorings, []);
});

test("a recommendation no longer in the overview is dropped and reported", () => {
  const r = resolveContinuedCare(recommendedOverview, { startConditionIds: [9, 77, "x", 9] });
  assert.deepEqual(r.startingConditions.map((c) => c.conditionId), [9]);
  // The care plan payload and the draft read the condition id from `id`.
  assert.deepEqual(r.startingConditions.map((c) => c.id), [9]);
  assert.deepEqual(r.droppedConditionIds, [77]);
  const none = resolveContinuedCare(null, { startConditionIds: [3] });
  assert.deepEqual(none.startingConditions, []);
  assert.deepEqual(none.droppedConditionIds, [3]);
  assert.deepEqual(resolveContinuedCare(overview, {}).startingConditions, []);
});

const visitOverview = {
  pendingFollowUps: [
    {
      id: 12, dueDate: "2026-10-20", reason: "BP recheck", sourceHealthRecordId: 91, sourceDate: "2026-10-06",
      conditions: [
        { monitoringId: 4, conditionName: "Hypertension" },
        { monitoringId: 5, conditionName: "Diabetes Mellitus" },
      ],
    },
    { id: 13, dueDate: "2026-10-25", sourceHealthRecordId: 92, conditions: [{ monitoringId: 6, conditionName: "Asthma" }] },
  ],
  monitoringWithoutFollowUp: [],
};

test("resolveContinuedCare carries reason, due date and source date", () => {
  const r = resolveContinuedCare(visitOverview, { followUpIds: [12, 13] });
  assert.deepEqual(r.continuedFollowUps, [
    { id: 12, sourceHealthRecordId: 91, reason: "BP recheck", dueDate: "2026-10-20", sourceDate: "2026-10-06" },
    { id: 13, sourceHealthRecordId: 92, reason: "", dueDate: "2026-10-25", sourceDate: "" },
  ]);
});

test("a monitoring pulled in only by a follow-up records which one; a ticked one does not", () => {
  const r = resolveContinuedCare(visitOverview, {
    followUpIds: [12, 13], monitoringIds: [5], includeFollowUpConditions: true,
  });
  assert.deepEqual(r.continuedMonitorings.map((m) => [m.id, m.viaFollowUpId]), [
    [4, 12],
    [5, undefined],
    [6, 13],
  ]);
  // A resumed draft stores no provenance, so none is invented.
  const resumed = resolveContinuedCare(visitOverview, { followUpIds: [12], monitoringIds: [4, 5] });
  assert.deepEqual(resumed.continuedMonitorings.map((m) => m.viaFollowUpId), [undefined, undefined]);
});

test("removeContinuedFollowUp drops the task and its task-only monitorings but keeps ticked ones", () => {
  const r = resolveContinuedCare(visitOverview, {
    followUpIds: [12, 13], monitoringIds: [5], includeFollowUpConditions: true,
  });
  const next = removeContinuedFollowUp(
    {
      continuedFollowUpTaskIds: r.continuedFollowUpTaskIds,
      continuedFollowUps: r.continuedFollowUps,
      continuedMonitorings: r.continuedMonitorings,
      monitoringStops: { 4: "Done", 5: "Kept", 6: "Other task" },
      monitoringReferrals: [4, 5, 6],
    },
    12,
  );
  assert.deepEqual(next.continuedFollowUpTaskIds, [13]);
  assert.deepEqual(next.continuedFollowUps.map((t) => t.id), [13]);
  assert.deepEqual(next.continuedMonitorings.map((m) => m.id), [5, 6]);
  assert.deepEqual(next.monitoringStops, { 5: "Kept", 6: "Other task" });
  assert.deepEqual(next.monitoringReferrals, [5, 6]);
});

test("removeContinuedFollowUp works on follow-ups alone and ignores an id that is not linked", () => {
  const r = resolveContinuedCare(visitOverview, { followUpIds: [12, 13] });
  const state = { continuedFollowUpTaskIds: r.continuedFollowUpTaskIds, continuedFollowUps: r.continuedFollowUps };
  assert.deepEqual(removeContinuedFollowUp(state, "13").continuedFollowUpTaskIds, [12]);
  assert.deepEqual(removeContinuedFollowUp(state, 99).continuedFollowUpTaskIds, [12, 13]);
  assert.deepEqual(removeContinuedFollowUp({}, 1), {
    continuedFollowUpTaskIds: [], continuedFollowUps: [], continuedMonitorings: [], monitoringStops: {}, monitoringReferrals: [],
  });
});

test("a monitoring shared by two selected follow-ups is kept when either is removed", () => {
  const r = resolveContinuedCare(linkedOverview, { followUpIds: [11, 12], includeFollowUpConditions: true });
  assert.deepEqual(r.continuedMonitorings.map((m) => [m.id, m.viaFollowUpId]), [[4, undefined], [5, 11]]);
  const next = removeContinuedFollowUp({ ...r }, 11);
  assert.deepEqual(next.continuedMonitorings.map((m) => m.id), [4]);
});
