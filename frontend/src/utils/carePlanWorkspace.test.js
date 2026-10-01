import test from "node:test";
import assert from "node:assert/strict";
import {
  carePlanDraftPayload,
  carePlanFollowUpErrors,
  carePlanReviewRows,
  continuedVisitLink,
  followUpPlan,
  nextPhaseBackTarget,
  nextPhaseForwardTarget,
  restoreCarePlanDraft,
  reviewBackTarget,
  setMonitoringStop,
} from "./carePlanWorkspace.js";
import { MONITORING_STEP, NEXT_STEP, REVIEW_STEP } from "./consultationSteps.js";

const registry = {
  monitored_conditions: {
    hypertension: { name: "Hypertension", aliases: ["HTN"] },
    diabetes_mellitus: { name: "Diabetes Mellitus", aliases: ["DM"] },
    tuberculosis: { name: "Tuberculosis", aliases: ["PTB"], monitoring_details: "tb_dots" },
  },
};

test("the follow-up is kept unless the visit only refers", () => {
  const none = { needsReferral: false, showsFollowUp: false, monitorsAny: false };
  const monitor = { needsReferral: false, showsFollowUp: true, monitorsAny: true };
  const referOnly = { needsReferral: true, showsFollowUp: false, monitorsAny: false };
  const monitorRefer = { needsReferral: true, showsFollowUp: true, monitorsAny: true };

  assert.deepEqual(followUpPlan(none, ""), { kept: true, shows: false });
  assert.deepEqual(followUpPlan(monitor, ""), { kept: true, shows: true });
  assert.deepEqual(followUpPlan(referOnly, "2026-10-08"), { kept: false, shows: false });
  assert.deepEqual(followUpPlan(monitorRefer, "2026-10-08"), { kept: true, shows: true });
  // A date already set (e.g. pre-filled from a Family Planning appointment)
  // stays visible so the worker can see and clear it.
  assert.deepEqual(followUpPlan(none, "2026-10-08"), { kept: true, shows: true });
});

test("a follow-up date needs a reason, whenever the follow-up is kept", () => {
  assert.deepEqual(carePlanFollowUpErrors({ kept: true, followUpDate: "2026-10-08", followUpReason: " " }), {
    followUpReason: "Follow-up reason is required.",
  });
  assert.deepEqual(carePlanFollowUpErrors({ kept: true, followUpDate: "2026-10-08", followUpReason: "BP recheck" }), {});
  assert.deepEqual(carePlanFollowUpErrors({ kept: true, followUpDate: "", followUpReason: "" }), {});
  assert.deepEqual(carePlanFollowUpErrors({ kept: false, followUpDate: "2026-10-08", followUpReason: "" }), {});
});

test("stop entries: null removes, a string (even empty) records the stop", () => {
  const stops = { 3: "Moved away" };
  assert.deepEqual(setMonitoringStop(stops, 4, ""), { 3: "Moved away", 4: "" });
  assert.deepEqual(setMonitoringStop(stops, 3, null), {});
  assert.deepEqual(stops, { 3: "Moved away" }, "the input is not mutated");
});

test("the draft stores ids and stops only, and restores them", () => {
  const draft = carePlanDraftPayload({
    continuedFollowUpTaskIds: [7],
    continuedMonitorings: [{ id: 3, conditionName: "Hypertension", conditionKey: "hypertension" }],
    monitoringStops: { 3: "Referred", 4: "" },
  });
  assert.deepEqual(draft, {
    continuedFollowUpTaskIds: [7],
    continuedMonitoringIds: [3],
    monitoringStops: [{ monitoringId: 3, reason: "Referred" }, { monitoringId: 4, reason: "" }],
  });

  assert.deepEqual(restoreCarePlanDraft(draft), {
    continuedFollowUpTaskIds: [7],
    continuedMonitorings: [{ id: 3, conditionName: "Monitored condition", conditionKey: null }],
    monitoringStops: { 3: "Referred", 4: "" },
  });
  assert.deepEqual(restoreCarePlanDraft(undefined), {
    continuedFollowUpTaskIds: [],
    continuedMonitorings: [],
    monitoringStops: {},
  });
  // Drafts round-trip through JSON; ids may come back as strings.
  assert.deepEqual(restoreCarePlanDraft({ continuedFollowUpTaskIds: ["7", "x"], continuedMonitoringIds: ["3"], monitoringStops: [{ monitoringId: "3", reason: null }] }), {
    continuedFollowUpTaskIds: [7],
    continuedMonitorings: [{ id: 3, conditionName: "Monitored condition", conditionKey: null }],
    monitoringStops: { 3: "" },
  });
});

test("the first continued follow-up links the visit to its source record", () => {
  assert.equal(continuedVisitLink([], []), null);
  assert.deepEqual(
    continuedVisitLink([7, 9], [{ id: 9, sourceHealthRecordId: 40 }, { id: 7, sourceHealthRecordId: 31 }]),
    { visitType: "follow_up_visit", followUpTaskId: 7, parentHealthRecordId: 31 },
  );
  // Source record unknown (e.g. a restored draft before care-overview loads):
  // the tasks are still fulfilled through care_plan, the visit stays initial.
  assert.equal(continuedVisitLink([7], []), null);
});

test("Care Plan continues to Monitoring Details only when a form is needed", () => {
  assert.equal(nextPhaseForwardTarget(NEXT_STEP, ["tb_dots"]), MONITORING_STEP);
  assert.equal(nextPhaseForwardTarget(NEXT_STEP, []), REVIEW_STEP);
  assert.equal(nextPhaseForwardTarget(MONITORING_STEP, ["tb_dots"]), REVIEW_STEP);
  assert.equal(nextPhaseBackTarget(MONITORING_STEP), NEXT_STEP);
  assert.equal(nextPhaseBackTarget(NEXT_STEP), null);
  assert.equal(reviewBackTarget(["tb_dots"]), MONITORING_STEP);
  assert.equal(reviewBackTarget([]), NEXT_STEP);
});

test("review rows list each plan, stops, referral and follow-up", () => {
  const rows = carePlanReviewRows({
    diagnoses: [
      { id: "d1", name: "HTN", carePlan: "refer" },
      { id: "d2", name: "Diabetes Mellitus", carePlan: "monitor_refer" },
    ],
    continuedMonitorings: [
      { id: 3, conditionName: "Hypertension", conditionKey: "hypertension" },
      { id: 4, conditionName: "Asthma", conditionKey: null },
    ],
    stops: { 3: "Managed at RHU", 4: "" },
    registry,
    referral: { needed: true, reason: "Referred for: HTN; Diabetes Mellitus", priority: "Urgent" },
    followUp: { shows: true, date: "October 8, 2026", time: "9:00 AM", reason: "FBS recheck" },
  });
  assert.deepEqual(rows, [
    { label: "HTN", value: "Refer to RHU · Monitoring stopped: Managed at RHU" },
    { label: "Diabetes Mellitus", value: "Monitor at BHC + Refer to RHU" },
    { label: "Asthma", value: "Stop monitoring" },
    { label: "Reason for Referral", value: "Referred for: HTN; Diabetes Mellitus" },
    { label: "Referral Priority", value: "Urgent" },
    { label: "Next Follow-up", value: "October 8, 2026 · 9:00 AM" },
    { label: "Follow-up Reason", value: "FBS recheck" },
  ]);
});

test("review rows say so when nothing follows the visit", () => {
  const rows = carePlanReviewRows({
    diagnoses: [{ id: "d1", name: "Cough" }],
    registry,
    referral: { needed: false },
    followUp: { shows: true, date: "" },
  });
  assert.deepEqual(rows, [
    { label: "Cough", value: "No Ongoing Tracking" },
    { label: "Next Follow-up", value: "Not scheduled" },
  ]);
  assert.deepEqual(
    carePlanReviewRows({ diagnoses: [], registry, referral: { needed: false }, followUp: { shows: false } }),
    [{ label: "Next Steps", value: "No follow-up or referral required." }],
  );
  assert.deepEqual(
    carePlanReviewRows({
      diagnoses: [],
      continuedMonitorings: [{ id: 4, conditionName: "Asthma", conditionKey: null }],
      registry,
      referral: { needed: false },
      followUp: { shows: true, date: "" },
    }),
    [
      { label: "Asthma", value: "Continue monitoring" },
      { label: "Next Follow-up", value: "Not scheduled" },
    ],
  );
});
