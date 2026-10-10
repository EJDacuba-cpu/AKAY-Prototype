import test from "node:test";
import assert from "node:assert/strict";
import {
  carePlanCoverage,
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
  sharedAcknowledgmentErrors,
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
  const none = { needsReferral: false, showsFollowUp: false, monitorsAny: false, keepsFollowUpWithReferral: false };
  const recheck = { needsReferral: false, showsFollowUp: true, monitorsAny: false, keepsFollowUpWithReferral: true };
  const referOnly = { needsReferral: true, showsFollowUp: false, monitorsAny: false, keepsFollowUpWithReferral: false };
  // One concern set to Recheck, another to Refer.
  const recheckAndRefer = { needsReferral: true, showsFollowUp: true, monitorsAny: false, keepsFollowUpWithReferral: true };
  // A followed condition referred this visit: still monitored, no Recheck / Follow-up concern.
  const referContinued = { needsReferral: true, showsFollowUp: true, monitorsAny: true, keepsFollowUpWithReferral: false };

  assert.deepEqual(followUpPlan(none, ""), { kept: true, shows: false });
  assert.deepEqual(followUpPlan(recheck, ""), { kept: true, shows: true });
  assert.deepEqual(followUpPlan(referOnly, "2026-10-08"), { kept: false, shows: false });
  assert.deepEqual(followUpPlan(recheckAndRefer, "2026-10-08"), { kept: true, shows: true });
  // Same rule as the server (CarePlan::keepsFollowUpWithReferral): only a
  // Recheck / Follow-up concern keeps the follow-up through a referral.
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

test("a concern that schedules a BHC follow-up requires the follow-up date", () => {
  const message = "Set the follow-up date for the concerns that schedule a BHC follow-up.";
  for (const concern of [{ name: "BP", carePlan: "follow_up" }, { name: "BP", carePlan: "refer", bhcFollowUp: true }]) {
    assert.deepEqual(
      carePlanFollowUpErrors({ kept: true, concerns: [concern], followUpDate: "", followUpReason: "" }),
      { followUpDate: message },
    );
  }
  // Even through a referral that otherwise hands the follow-up to the RHU.
  assert.deepEqual(
    carePlanFollowUpErrors({ kept: false, concerns: [{ name: "BP", carePlan: "follow_up" }, { name: "TB", carePlan: "refer" }], followUpDate: "" }),
    { followUpDate: message },
  );
  assert.deepEqual(
    carePlanFollowUpErrors({ kept: true, concerns: [{ name: "BP", carePlan: "follow_up" }], followUpDate: "2026-10-08", followUpReason: "Recheck: BP" }),
    {},
  );
  // Refer, no next action and old-draft legacy values never require it.
  assert.deepEqual(
    carePlanFollowUpErrors({ kept: false, concerns: [{ name: "TB", carePlan: "refer" }, { name: "Cough" }, { name: "HTN", carePlan: "monitor" }], followUpDate: "" }),
    {},
  );
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
    startConditionIds: [],
  });

  assert.deepEqual(restoreCarePlanDraft(draft), {
    continuedFollowUpTaskIds: [7],
    continuedMonitorings: [{ id: 3, conditionName: "Monitored condition", conditionKey: null }],
    monitoringStops: { 3: "Referred", 4: "" },
    monitoringReferrals: [],
    startConditionIds: [],
  });
  assert.deepEqual(restoreCarePlanDraft(undefined), {
    continuedFollowUpTaskIds: [],
    continuedMonitorings: [],
    monitoringStops: {},
    monitoringReferrals: [],
    startConditionIds: [],
  });
  // Drafts round-trip through JSON; ids may come back as strings.
  assert.deepEqual(restoreCarePlanDraft({ continuedFollowUpTaskIds: ["7", "x"], continuedMonitoringIds: ["3"], monitoringStops: [{ monitoringId: "3", reason: null }] }), {
    continuedFollowUpTaskIds: [7],
    continuedMonitorings: [{ id: 3, conditionName: "Monitored condition", conditionKey: null }],
    monitoringStops: { 3: "" },
    monitoringReferrals: [],
    startConditionIds: [],
  });
});

test("a draft keeps the referral decisions and the conditions being started", () => {
  const draft = carePlanDraftPayload({
    continuedMonitorings: [{ id: 3 }, { id: 4 }],
    monitoringReferrals: [3],
    startingConditions: [{ id: 7 }, { id: 8 }],
  });
  assert.deepEqual(draft.monitoringReferrals, [3]);
  assert.deepEqual(draft.startConditionIds, [7, 8]);
  assert.ok(!("monitoringStatuses" in draft));
  const restored = restoreCarePlanDraft(JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(restored.monitoringReferrals, [3]);
  assert.deepEqual(restored.startConditionIds, [7, 8]);
  // An old draft's status updates are no longer restored.
  assert.ok(!("monitoringStatuses" in restoreCarePlanDraft({ monitoringStatuses: [{ monitoringId: 3, status: "Controlled" }] })));
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

test("review rows show a followed condition's decision", () => {
  const rows = carePlanReviewRows({
    concerns: [],
    continuedMonitorings: [
      { id: 3, conditionName: "Hypertension", conditionKey: "hypertension" },
      { id: 4, conditionName: "Asthma", conditionKey: null },
      { id: 5, conditionName: "Tuberculosis", conditionKey: "tuberculosis" },
    ],
    stops: { 5: "Completed treatment" },
    referrals: [3],
    registry,
    referral: { needed: true, reason: "Referred for: Hypertension", priority: "Routine" },
  });
  assert.deepEqual(rows.slice(0, 3), [
    { label: "Hypertension", value: "Refer to RHU · Monitoring continues" },
    { label: "Asthma", value: "Continue monitoring" },
    { label: "Tuberculosis", value: "Stop monitoring: Completed treatment" },
  ]);
});

test("review rows list a condition being started as a monitored condition", () => {
  const rows = carePlanReviewRows({
    concerns: [],
    startingConditions: [{ id: 7, conditionName: "Hypertension", status: "Active", confirmedAt: "2026-10-01" }],
    registry,
    referral: { needed: false },
    followUp: { shows: true, date: "" },
  });
  assert.deepEqual(rows, [
    { label: "Hypertension", value: "Start monitoring at BHC" },
    { label: "Next Follow-up", value: "Not scheduled" },
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

test("review rows list each concern's next action, followed conditions, referral and follow-up", () => {
  const rows = carePlanReviewRows({
    concerns: [
      { id: "d1", name: "Elevated BP", carePlan: "none" },
      { id: "d2", name: "Wound", carePlan: "follow_up" },
      { id: "d3", name: "Pneumonia", carePlan: "refer" },
      { id: "d4", name: "Cough" },
    ],
    continuedMonitorings: [
      { id: 3, conditionName: "Hypertension", conditionKey: "hypertension" },
      { id: 4, conditionName: "Asthma", conditionKey: null },
    ],
    stops: { 4: "" },
    registry,
    referral: { needed: true, reason: "Referred for: Pneumonia", priority: "Urgent" },
    followUp: { shows: true, date: "October 8, 2026", time: "9:00 AM", reason: "Recheck: Elevated BP" },
  });
  assert.deepEqual(rows, [
    { label: "Elevated BP", value: "No Further BHC Action" },
    { label: "Wound", value: "Schedule BHC Follow-up" },
    { label: "Pneumonia", value: "Refer to RHU" },
    { label: "Cough", value: "No next action" },
    { label: "Hypertension", value: "Continue monitoring" },
    { label: "Asthma", value: "Stop monitoring" },
    { label: "Reason for Referral", value: "Referred for: Pneumonia" },
    { label: "Referral Priority", value: "Urgent" },
    { label: "Next Follow-up", value: "October 8, 2026 · 9:00 AM" },
    { label: "Follow-up Reason", value: "Recheck: Elevated BP" },
  ]);
});

test("review rows say so when nothing follows the visit", () => {
  assert.deepEqual(
    carePlanReviewRows({ concerns: [{ id: "d1", name: "Cough" }], registry, referral: { needed: false }, followUp: { shows: true, date: "" } }),
    [
      { label: "Cough", value: "No next action" },
      { label: "Next Follow-up", value: "Not scheduled" },
    ],
  );
  assert.deepEqual(
    carePlanReviewRows({ concerns: [], registry, referral: { needed: false }, followUp: { shows: false } }),
    [{ label: "Next Steps", value: "No health concern was recorded for this visit." }],
  );
  // With concerns, each concern's own row already says what follows.
  assert.deepEqual(
    carePlanReviewRows({ concerns: [{ id: "d1", name: "Cough" }], registry, referral: { needed: false }, followUp: { shows: false } }),
    [{ label: "Cough", value: "No next action" }],
  );
  assert.deepEqual(
    carePlanReviewRows({
      concerns: [],
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

const ACK_MESSAGE =
  "AKAY records one referral and one follow-up date per consultation. If these concerns need a different facility, priority or date, refer or schedule the most urgent one here, set the others to another action, and follow your facility's referral or escalation procedure for the rest. Record what you did in Additional Clinical Notes.";

test("carePlanCoverage lists follow-up and referral items", () => {
  const coverage = carePlanCoverage({
    concerns: [
      { id: "a", name: "Wound", carePlan: "follow_up" },
      { id: "b", name: "Cough", carePlan: "refer", bhcFollowUp: true },
    ],
    continuedMonitorings: [{ id: 3, conditionName: "Hypertension", conditionKey: "hypertension" }],
  });
  assert.deepEqual(coverage, {
    followUpCovers: ["Concern 1 — Wound", "Concern 2 — Cough", "Hypertension monitoring"],
    referralCovers: ["Concern 2 — Cough"],
    followUpConcernCount: 2,
  });
});

test("carePlanCoverage numbers concerns by their place, and adds referred conditions and the service visit", () => {
  const coverage = carePlanCoverage({
    concerns: [
      { id: "a", name: "Rash", carePlan: "none" },
      { id: "b", name: "Chest pain", carePlan: "refer" },
      { id: "c", name: "Fever" },
      { id: "d", name: "Itch", carePlan: "monitor_refer" },
    ],
    continuedMonitorings: [
      { id: 3, conditionName: "Hypertension" },
      { id: 4, conditionName: "Asthma" },
      { id: 5, conditionName: "Diabetes Mellitus" },
    ],
    startingConditions: [{ id: 7, conditionName: "Tuberculosis" }],
    stops: { 4: "Moved away" },
    referrals: [3, 4],
    serviceNextVisitLabel: "Prenatal next visit",
  });
  // A stopped condition is neither monitored nor referred; a referred one stays
  // monitored; a condition started this visit is monitored too.
  assert.deepEqual(coverage.followUpCovers, [
    "Hypertension monitoring",
    "Diabetes Mellitus monitoring",
    "Tuberculosis monitoring",
    "Prenatal next visit",
  ]);
  // A historical value from an old draft is not a choice, so it refers nothing.
  assert.deepEqual(coverage.referralCovers, ["Concern 2 — Chest pain", "Hypertension"]);
  assert.deepEqual(carePlanCoverage(), { followUpCovers: [], referralCovers: [], followUpConcernCount: 0 });
});

test("acknowledgment is required only for two or more covered items", () => {
  const two = ["Concern 1 — Wound", "Concern 2 — Cough"];
  // The follow-up counts the concerns that schedule it; the referral counts every referred item.
  assert.deepEqual(
    sharedAcknowledgmentErrors({ followUpConcernCount: 2, referralCovers: two, followUpAcknowledged: false, referralAcknowledged: false }),
    { followUpAcknowledged: ACK_MESSAGE, referralAcknowledged: ACK_MESSAGE },
  );
  assert.deepEqual(
    sharedAcknowledgmentErrors({ followUpConcernCount: 2, referralCovers: two, followUpAcknowledged: true, referralAcknowledged: false }),
    { referralAcknowledged: ACK_MESSAGE },
  );
  assert.deepEqual(
    sharedAcknowledgmentErrors({ followUpConcernCount: 2, referralCovers: two, followUpAcknowledged: true, referralAcknowledged: true }),
    {},
  );
  // One item each: nothing to acknowledge.
  assert.deepEqual(
    sharedAcknowledgmentErrors({ followUpConcernCount: 1, referralCovers: [two[1]], followUpAcknowledged: false, referralAcknowledged: false }),
    {},
  );
  assert.deepEqual(sharedAcknowledgmentErrors(), {});
  // A referred concern and a referred monitored condition: two referred items.
  const coverage = carePlanCoverage({
    concerns: [{ id: "a", name: "Cough", carePlan: "refer" }],
    continuedMonitorings: [{ id: 3, conditionName: "Hypertension" }],
    referrals: [3],
  });
  assert.deepEqual(sharedAcknowledgmentErrors({ ...coverage }), { referralAcknowledged: ACK_MESSAGE });
});

test("monitored conditions and the service visit never count toward the follow-up acknowledgment", () => {
  const ack = (input) => sharedAcknowledgmentErrors({ ...carePlanCoverage(input) }).followUpAcknowledged;
  // Two monitored conditions, no concern.
  assert.equal(
    ack({ continuedMonitorings: [{ id: 3, conditionName: "Hypertension" }, { id: 4, conditionName: "Asthma" }], serviceNextVisitLabel: "Prenatal next visit" }),
    undefined,
  );
  // One follow-up concern and one monitored condition.
  assert.equal(
    ack({ concerns: [{ id: "a", name: "Wound", carePlan: "follow_up" }], continuedMonitorings: [{ id: 3, conditionName: "Hypertension" }] }),
    undefined,
  );
  // Two follow-up concerns (a flagged referral counts).
  assert.equal(
    ack({ concerns: [{ id: "a", name: "Wound", carePlan: "follow_up" }, { id: "b", name: "Cough", carePlan: "refer", bhcFollowUp: true }] }),
    ACK_MESSAGE,
  );
  // An unflagged referral does not schedule the follow-up.
  assert.equal(
    ack({ concerns: [{ id: "a", name: "Wound", carePlan: "follow_up" }, { id: "b", name: "Cough", carePlan: "refer" }] }),
    undefined,
  );
});

test("follow-up date and reason errors use the new messages and count flagged referrals", () => {
  const flagged = [{ id: "b", name: "Cough", carePlan: "refer", bhcFollowUp: true }];
  assert.deepEqual(carePlanFollowUpErrors({ kept: true, concerns: flagged, followUpDate: "", followUpReason: "" }), {
    followUpDate: "Set the follow-up date for the concerns that schedule a BHC follow-up.",
  });
  assert.deepEqual(carePlanFollowUpErrors({ kept: true, concerns: flagged, followUpDate: "2026-10-20", followUpReason: "" }), {
    followUpReason: "Follow-up reason is required.",
  });
  // An unflagged referral schedules no BHC follow-up.
  assert.deepEqual(carePlanFollowUpErrors({ kept: false, concerns: [{ id: "b", name: "Cough", carePlan: "refer" }], followUpDate: "" }), {});
});

test("review rows label a flagged referral", () => {
  const rows = carePlanReviewRows({
    concerns: [
      { id: "a", name: "Cough", carePlan: "refer", bhcFollowUp: true },
      { id: "b", name: "Chest pain", carePlan: "refer" },
    ],
    referral: { needed: false },
    followUp: { shows: false },
  });
  assert.deepEqual(rows, [
    { label: "Cough", value: "Refer to RHU · BHC follow-up" },
    { label: "Chest pain", value: "Refer to RHU" },
  ]);
});

test("review rows list completed follow-ups", () => {
  const rows = carePlanReviewRows({
    concerns: [{ id: "d1", name: "Cough", carePlan: "none" }],
    continuedFollowUps: [{ id: 12 }, { id: "15" }],
    registry,
    referral: { needed: false },
    followUp: { shows: false },
  });
  assert.deepEqual(rows, [
    { label: "Completes follow-up", value: "FU-12" },
    { label: "Completes follow-up", value: "FU-15" },
    { label: "Cough", value: "No Further BHC Action" },
  ]);
  assert.equal(rows.some((row) => row.label === "Next Steps"), false);
});

test("the draft carries ids only, never the follow-up link provenance", () => {
  const draft = carePlanDraftPayload({
    continuedFollowUpTaskIds: [12],
    continuedMonitorings: [{ id: 4, conditionName: "Hypertension", viaFollowUpId: 12 }],
  });
  assert.deepEqual(draft.continuedMonitoringIds, [4]);
  assert.equal(JSON.stringify(draft).includes("viaFollowUpId"), false);
});
