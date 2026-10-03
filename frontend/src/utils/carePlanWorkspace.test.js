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
  setMonitoringDecision,
  setMonitoringStop,
  shouldRegenerateReferralReason,
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
  const none = { needsReferral: false, showsFollowUp: false, monitorsAny: false, monitorsDiagnosis: false };
  const monitor = { needsReferral: false, showsFollowUp: true, monitorsAny: true, monitorsDiagnosis: true };
  const referOnly = { needsReferral: true, showsFollowUp: false, monitorsAny: false, monitorsDiagnosis: false };
  // One diagnosis set to Monitor, another to Refer.
  const monitorAndRefer = { needsReferral: true, showsFollowUp: true, monitorsAny: true, monitorsDiagnosis: true };
  // A continued condition referred this visit: still monitored, no Monitor row.
  const referContinued = { needsReferral: true, showsFollowUp: true, monitorsAny: true, monitorsDiagnosis: false };

  assert.deepEqual(followUpPlan(none, ""), { kept: true, shows: false });
  assert.deepEqual(followUpPlan(monitor, ""), { kept: true, shows: true });
  assert.deepEqual(followUpPlan(referOnly, "2026-10-08"), { kept: false, shows: false });
  assert.deepEqual(followUpPlan(monitorAndRefer, "2026-10-08"), { kept: true, shows: true });
  // Same rule as the server (CarePlan::keepsFollowUpWithReferral): only a
  // diagnosis set to Monitor keeps the follow-up through a referral.
  assert.deepEqual(followUpPlan(referContinued, "2026-10-08"), { kept: false, shows: false });
  // A date already set (e.g. pre-filled from a Family Planning appointment)
  // stays visible so the worker can see and clear it.
  assert.deepEqual(followUpPlan(none, "2026-10-08"), { kept: true, shows: true });
});

test("a referred service visit keeps its next-visit follow-up once a date is set", () => {
  const referOnly = { needsReferral: true, showsFollowUp: false, monitorsAny: false };
  const referVaccination = { needsReferral: true, showsFollowUp: true, monitorsAny: false };
  const service = { hasService: true };

  // Same rule as the server (CarePlan::keepsFollowUpWithReferral).
  assert.deepEqual(followUpPlan(referVaccination, "2026-11-01", service), { kept: true, shows: true });
  assert.deepEqual(followUpPlan(referOnly, "2026-11-01", service), { kept: true, shows: true });
  // No date yet: nothing is kept, but the fields still show so one can be set.
  assert.deepEqual(followUpPlan(referVaccination, "", service), { kept: false, shows: true });
  assert.deepEqual(followUpPlan(referOnly, "", service), { kept: false, shows: false });
  // Plain refer with no service still drops it, date or not.
  assert.deepEqual(followUpPlan(referVaccination, "2026-11-01", { hasService: false }), { kept: false, shows: false });
  assert.deepEqual(followUpPlan(referOnly, "2026-11-01"), { kept: false, shows: false });
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
    monitoringReferrals: [],
    monitoringStatuses: [],
  });

  assert.deepEqual(restoreCarePlanDraft(draft), {
    continuedFollowUpTaskIds: [7],
    continuedMonitorings: [{ id: 3, conditionName: "Monitored condition", conditionKey: null }],
    monitoringStops: { 3: "Referred", 4: "" },
    monitoringReferrals: [],
    monitoringStatuses: {},
  });
  assert.deepEqual(restoreCarePlanDraft(undefined), {
    continuedFollowUpTaskIds: [],
    continuedMonitorings: [],
    monitoringStops: {},
    monitoringReferrals: [],
    monitoringStatuses: {},
  });
  // Drafts round-trip through JSON; ids may come back as strings.
  assert.deepEqual(restoreCarePlanDraft({ continuedFollowUpTaskIds: ["7", "x"], continuedMonitoringIds: ["3"], monitoringStops: [{ monitoringId: "3", reason: null }] }), {
    continuedFollowUpTaskIds: [7],
    continuedMonitorings: [{ id: 3, conditionName: "Monitored condition", conditionKey: null }],
    monitoringStops: { 3: "" },
    monitoringReferrals: [],
    monitoringStatuses: {},
  });
});

test("a draft keeps the referral and status decisions for followed conditions", () => {
  const draft = carePlanDraftPayload({
    continuedMonitorings: [{ id: 3 }, { id: 4 }],
    monitoringReferrals: [3],
    monitoringStatuses: { 3: "Controlled", 4: "" },
  });
  assert.deepEqual(draft.monitoringReferrals, [3]);
  assert.deepEqual(draft.monitoringStatuses, [{ monitoringId: 3, status: "Controlled" }]);
  const restored = restoreCarePlanDraft(JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(restored.monitoringReferrals, [3]);
  assert.deepEqual(restored.monitoringStatuses, { 3: "Controlled" });
  // Anything that is not a real status is dropped on the way back.
  assert.deepEqual(restoreCarePlanDraft({ monitoringStatuses: [{ monitoringId: 3, status: "Cured" }] }).monitoringStatuses, {});
});

test("one decision per followed condition: continue, refer or stop", () => {
  const start = { stops: {}, referrals: [] };
  const referred = setMonitoringDecision(start, 3, "refer");
  assert.deepEqual(referred, { stops: {}, referrals: [3] });
  const stopped = setMonitoringDecision(referred, 3, "stop");
  assert.deepEqual(stopped, { stops: { 3: "" }, referrals: [] }, "stopping drops the referral and asks for a reason");
  const back = setMonitoringDecision({ stops: { 3: "Moved away" }, referrals: [] }, 3, "continue");
  assert.deepEqual(back, { stops: {}, referrals: [] });
  assert.deepEqual(setMonitoringDecision(referred, 3, "refer"), { stops: {}, referrals: [3] }, "no duplicate");
  assert.deepEqual(start, { stops: {}, referrals: [] }, "the input is not mutated");
  // Stopping keeps a reason already typed.
  assert.deepEqual(setMonitoringDecision({ stops: { 3: "Moved away" }, referrals: [] }, 3, "stop").stops, { 3: "Moved away" });
});

test("review rows show a followed condition's decision and any status change", () => {
  const rows = carePlanReviewRows({
    diagnoses: [],
    continuedMonitorings: [
      { id: 3, conditionName: "Hypertension", conditionKey: "hypertension" },
      { id: 4, conditionName: "Asthma", conditionKey: null },
      { id: 5, conditionName: "Tuberculosis", conditionKey: "tuberculosis" },
    ],
    stops: { 5: "Completed treatment" },
    referrals: [3],
    statuses: { 3: "Controlled", 5: "Resolved" },
    registry,
    referral: { needed: true, reason: "Referred for: Hypertension", priority: "Routine" },
  });
  assert.deepEqual(rows.slice(0, 3), [
    { label: "Hypertension", value: "Refer to RHU · Monitoring continues · Condition status: Controlled" },
    { label: "Asthma", value: "Continue monitoring" },
    { label: "Tuberculosis", value: "Stop monitoring: Completed treatment · Condition status: Resolved" },
  ]);
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
      { id: "d2", name: "Diabetes Mellitus", carePlan: "monitor" },
      { id: "d3", name: "Pneumonia", carePlan: "none" },
    ],
    continuedMonitorings: [
      { id: 3, conditionName: "Hypertension", conditionKey: "hypertension" },
      { id: 4, conditionName: "Asthma", conditionKey: null },
      { id: 5, conditionName: "Pneumonia", conditionKey: null },
    ],
    stops: { 3: "Stale reason", 4: "", 5: "Resolved" },
    registry,
    referral: { needed: true, reason: "Referred for: HTN; Diabetes Mellitus", priority: "Urgent" },
    followUp: { shows: true, date: "October 8, 2026", time: "9:00 AM", reason: "FBS recheck" },
  });
  assert.deepEqual(rows, [
    { label: "HTN", value: "Refer to RHU · Monitoring continues" },
    { label: "Diabetes Mellitus", value: "Monitor at BHC" },
    { label: "Pneumonia", value: "No Ongoing Tracking · Monitoring stopped: Resolved" },
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
    [{ label: "Next Steps", value: "No suspected condition was recorded for this visit. No condition-specific care plan is required." }],
  );
  // With conditions, each condition's own row already says No Ongoing Tracking.
  assert.deepEqual(
    carePlanReviewRows({ diagnoses: [{ id: "d1", name: "Cough", carePlan: "none" }], registry, referral: { needed: false }, followUp: { shows: false } }),
    [{ label: "Cough", value: "No Ongoing Tracking" }],
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

test("the referral reason follows the referred diagnoses until the worker edits it", () => {
  const first = "Referred for: Pneumonia";
  const next = "Referred for: Pneumonia; Hypertension";

  // Empty, or still exactly what was last filled in: regenerate.
  assert.equal(shouldRegenerateReferralReason({ current: "", lastAuto: "", next: first }), true);
  assert.equal(shouldRegenerateReferralReason({ current: "  ", lastAuto: "", next: first }), true);
  assert.equal(shouldRegenerateReferralReason({ current: first, lastAuto: first, next }), true);
  // Edited by the worker (or restored from a draft): never overwritten.
  assert.equal(shouldRegenerateReferralReason({ current: `${first}, SpO2 low`, lastAuto: first, next }), false);
  assert.equal(shouldRegenerateReferralReason({ current: "From the draft", lastAuto: "", next }), false);
  // Nothing to change, or nothing to fill in.
  assert.equal(shouldRegenerateReferralReason({ current: next, lastAuto: first, next }), false);
  assert.equal(shouldRegenerateReferralReason({ current: first, lastAuto: first, next: "" }), false);
  assert.equal(shouldRegenerateReferralReason({ current: undefined, lastAuto: "", next: first }), true);
});
