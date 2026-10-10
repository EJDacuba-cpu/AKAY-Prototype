import test from "node:test";
import assert from "node:assert/strict";
import {
  followUpDateWarnings,
  followUpReasonExempt,
  initialNextActions,
  nextActionErrors,
  nextActionsDraft,
  nextActionsPayload,
  nextStepsReviewRows,
  referralItemCount,
  referralNeedsAcknowledgment,
  restoreNextActions,
  serviceDateSuggestions,
  setFollowUpChecked,
  setReferChecked,
} from "./nextActions.js";
import { SHARED_ACKNOWLEDGMENT_MESSAGE } from "./carePlanWorkspace.js";

const followUpOn = { ...initialNextActions(), bhcFollowUp: true };
const referOn = { ...initialNextActions(), referToRhu: true };

test("initialNextActions is all false and nothing ticks the follow-up by itself", () => {
  assert.deepEqual(initialNextActions(), { bhcFollowUp: false, referToRhu: false, referralMultipleIssues: false });
  assert.equal(setReferChecked(initialNextActions(), true).bhcFollowUp, false);
  assert.equal(setFollowUpChecked(initialNextActions(), true).bhcFollowUp, true);
  assert.equal(setFollowUpChecked(followUpOn, false).bhcFollowUp, false);
});

test("unticking Refer to RHU also clears the multiple-issues acknowledgment", () => {
  const state = { bhcFollowUp: true, referToRhu: true, referralMultipleIssues: true };
  assert.deepEqual(setReferChecked(state, false), { bhcFollowUp: true, referToRhu: false, referralMultipleIssues: false });
  assert.deepEqual(setReferChecked(state, true), state);
  assert.equal(state.referToRhu, true);
});

test("followUpReasonExempt is true with a selected service or continued monitoring (H6)", () => {
  assert.equal(followUpReasonExempt({ selectedPrograms: ["maternal"], monitorsAny: false }), true);
  assert.equal(followUpReasonExempt({ selectedPrograms: [], monitorsAny: true }), true);
  assert.equal(followUpReasonExempt({ selectedPrograms: [], monitorsAny: false }), false);
  assert.equal(followUpReasonExempt({}), false);
});

test("serviceDateSuggestions drops blanks and keeps EPI before FP", () => {
  assert.deepEqual(
    serviceDateSuggestions({ immunizationNextDate: "2026-11-07", familyPlanningNextDate: "2026-12-01" }),
    [
      { source: "EPI next dose", date: "2026-11-07" },
      { source: "FP next appointment", date: "2026-12-01" },
    ],
  );
  assert.deepEqual(serviceDateSuggestions({ immunizationNextDate: "  ", familyPlanningNextDate: "2026-12-01" }), [
    { source: "FP next appointment", date: "2026-12-01" },
  ]);
  assert.deepEqual(serviceDateSuggestions({}), []);
});

test("followUpDateWarnings warns on a differing date and stays quiet otherwise", () => {
  const suggestions = [{ source: "EPI next dose", date: "2026-11-07" }];
  assert.deepEqual(followUpDateWarnings("2026-10-20", suggestions), [
    "The follow-up date differs from the EPI next dose (2026-11-07).",
  ]);
  assert.deepEqual(followUpDateWarnings("2026-11-07", suggestions), []);
  assert.deepEqual(followUpDateWarnings("", suggestions), []);
  assert.deepEqual(followUpDateWarnings("  ", suggestions), []);
  assert.deepEqual(followUpDateWarnings("2026-10-20", []), []);
});

test("nextActionErrors never carries a warning key, even with a differing date", () => {
  const errors = nextActionErrors({
    state: followUpOn,
    followUp: { date: "2026-10-20", reason: "Recheck" },
    referral: { reason: "" },
    reasonExempt: false,
    acknowledged: false,
    count: 0,
    multipleIssues: false,
  });
  assert.deepEqual(errors, {});
});

test("H6: a service selected means no reason is needed, but the date still is", () => {
  const errors = nextActionErrors({
    state: followUpOn,
    followUp: { date: "", reason: "" },
    referral: {},
    reasonExempt: followUpReasonExempt({ selectedPrograms: ["maternal"], monitorsAny: false }),
    acknowledged: false,
    count: 0,
    multipleIssues: false,
  });
  assert.deepEqual(errors, { followUpDate: "Set the follow-up date." });
  assert.equal("followUpReason" in errors, false);
});

test("a general visit with the follow-up ticked and no reason needs a reason", () => {
  const errors = nextActionErrors({
    state: followUpOn,
    followUp: { date: "2026-10-20", reason: "  " },
    referral: {},
    reasonExempt: false,
    acknowledged: false,
    count: 0,
    multipleIssues: false,
  });
  assert.deepEqual(errors, { followUpReason: "Follow-up reason is required." });
});

test("unticked sections raise no errors", () => {
  assert.deepEqual(
    nextActionErrors({
      state: initialNextActions(),
      followUp: { date: "", reason: "" },
      referral: { reason: "" },
      reasonExempt: false,
      acknowledged: false,
      count: 0,
      multipleIssues: false,
    }),
    {},
  );
});

test("a ticked referral needs a reason and, when it covers 2+ items, the acknowledgment", () => {
  const errors = nextActionErrors({
    state: referOn,
    followUp: {},
    referral: { reason: "" },
    reasonExempt: false,
    acknowledged: false,
    count: 2,
    multipleIssues: false,
  });
  assert.deepEqual(errors, {
    reasonForReferral: "Reason for referral is required.",
    referralAcknowledged: SHARED_ACKNOWLEDGMENT_MESSAGE,
  });
  const acknowledged = nextActionErrors({
    state: referOn,
    followUp: {},
    referral: { reason: "Needs workup" },
    reasonExempt: false,
    acknowledged: true,
    count: 2,
    multipleIssues: false,
  });
  assert.deepEqual(acknowledged, {});
  const multiple = nextActionErrors({
    state: referOn,
    followUp: {},
    referral: { reason: "Needs workup" },
    reasonExempt: false,
    acknowledged: false,
    count: 1,
    multipleIssues: true,
  });
  assert.deepEqual(multiple, { referralAcknowledged: SHARED_ACKNOWLEDGMENT_MESSAGE });
});

test("monitoring referrals alone (Refer unticked) still need the acknowledgment at 2+ items", () => {
  const errors = nextActionErrors({
    state: initialNextActions(),
    followUp: {},
    referral: {},
    reasonExempt: false,
    acknowledged: false,
    count: referralItemCount({ referToRhu: false, monitoringReferralIds: ["a", "b"] }),
    multipleIssues: false,
  });
  assert.deepEqual(errors, { referralAcknowledged: SHARED_ACKNOWLEDGMENT_MESSAGE });
});

test("referral item count and acknowledgment follow the server rule", () => {
  assert.equal(referralItemCount({ referToRhu: true, monitoringReferralIds: [] }), 1);
  assert.equal(referralNeedsAcknowledgment({ count: 1, multipleIssues: false }), false);
  assert.equal(referralItemCount({ referToRhu: true, monitoringReferralIds: ["htn"] }), 2);
  assert.equal(referralNeedsAcknowledgment({ count: 2, multipleIssues: false }), true);
  assert.equal(referralNeedsAcknowledgment({ count: 1, multipleIssues: true }), true);
  assert.equal(referralItemCount({ referToRhu: false, monitoringReferralIds: ["a", "a", "b"] }), 2);
  assert.equal(referralItemCount({}), 0);
});

test("EPI visit with a suggestion but the follow-up unticked sends no follow-up date or status", () => {
  const suggestions = serviceDateSuggestions({ immunizationNextDate: "2026-11-07" });
  assert.equal(suggestions.length, 1);
  const payload = nextActionsPayload(initialNextActions(), {
    followUp: { status: "scheduled", date: "2026-11-07", time: "09:00", reason: "Next dose" },
    monitoringReferralIds: [],
  });
  assert.equal(payload.monitoring_data.followUpDate, "");
  assert.equal(payload.monitoring_data.followUpStatus, "");
  assert.equal(payload.monitoring_data.followUpTime, "");
  assert.equal(payload.monitoring_data.followUpReason, "");
  assert.equal(payload.care_plan.bhc_follow_up, false);
});

test("Refer unticked sends no referral even though the state keeps the history", () => {
  const state = { bhcFollowUp: false, referToRhu: true, referralMultipleIssues: true };
  const payload = nextActionsPayload({ ...state, referToRhu: false }, { followUp: {}, monitoringReferralIds: [] });
  assert.equal(payload.needs_referral, false);
  assert.equal(typeof payload.needs_referral, "boolean");
  assert.equal(payload.care_plan.refer_to_rhu, false);
  assert.equal(payload.care_plan.referral_multiple_issues, false);
  assert.equal(state.referToRhu, true);
});

test("monitoring referrals alone make needs_referral true while refer_to_rhu stays false", () => {
  const payload = nextActionsPayload(initialNextActions(), { followUp: {}, monitoringReferralIds: ["htn"] });
  assert.equal(payload.needs_referral, true);
  assert.equal(payload.care_plan.refer_to_rhu, false);
});

test("both ticked sends the follow-up and the referral", () => {
  const state = { bhcFollowUp: true, referToRhu: true, referralMultipleIssues: true };
  const payload = nextActionsPayload(state, {
    followUp: { status: "scheduled", date: "2026-10-20", time: "10:30", reason: "Recheck BP" },
    monitoringReferralIds: [],
  });
  assert.deepEqual(payload, {
    needs_referral: true,
    care_plan: { bhc_follow_up: true, refer_to_rhu: true, referral_multiple_issues: true },
    monitoring_data: {
      followUpStatus: "scheduled",
      followUpDate: "2026-10-20",
      followUpTime: "10:30",
      followUpReason: "Recheck BP",
    },
  });
});

test("a ticked follow-up with no explicit status leaves the status to the server", () => {
  const payload = nextActionsPayload(followUpOn, { followUp: { date: "2026-10-20" }, monitoringReferralIds: [] });
  assert.equal(payload.monitoring_data.followUpStatus, "");
  assert.equal(payload.monitoring_data.followUpDate, "2026-10-20");
});

test("the draft holds the three booleans and restoring is lenient", () => {
  const state = { bhcFollowUp: true, referToRhu: true, referralMultipleIssues: true };
  assert.deepEqual(nextActionsDraft(state), state);
  assert.deepEqual(restoreNextActions(nextActionsDraft(state)), state);
  const noRefer = { bhcFollowUp: true, referToRhu: false, referralMultipleIssues: false };
  assert.deepEqual(restoreNextActions(nextActionsDraft(noRefer)), noRefer);
  assert.deepEqual(restoreNextActions({ bhcFollowUp: true }), { bhcFollowUp: true, referToRhu: false, referralMultipleIssues: false });
  assert.deepEqual(restoreNextActions({}), initialNextActions());
  assert.deepEqual(restoreNextActions(null), initialNextActions());
  assert.deepEqual(restoreNextActions(undefined), initialNextActions());
  assert.deepEqual(restoreNextActions({ bhcFollowUp: "true", referToRhu: 1, referralMultipleIssues: "yes" }), initialNextActions());
});

test("restoring keeps multiple-issues only with Refer ticked, and a referral-only draft does not tick the follow-up", () => {
  assert.deepEqual(restoreNextActions({ referToRhu: false, referralMultipleIssues: true }), {
    bhcFollowUp: false,
    referToRhu: false,
    referralMultipleIssues: false,
  });
  assert.deepEqual(restoreNextActions({ referToRhu: true, referralMultipleIssues: true }), {
    bhcFollowUp: false,
    referToRhu: true,
    referralMultipleIssues: true,
  });
  const referralOnly = restoreNextActions({ referToRhu: true });
  assert.equal(referralOnly.bhcFollowUp, false);
  assert.equal(referralOnly.referToRhu, true);
});

test("a stale multiple-issues flag with Refer unticked demands no acknowledgment", () => {
  const errors = nextActionErrors({
    state: initialNextActions(),
    followUp: {},
    referral: {},
    reasonExempt: false,
    acknowledged: false,
    count: 0,
    multipleIssues: true,
  });
  assert.equal("referralAcknowledged" in errors, false);
  assert.deepEqual(errors, {});
});

test("review rows omit unticked sections", () => {
  assert.deepEqual(
    nextStepsReviewRows({
      state: initialNextActions(),
      followUp: { date: "2026-10-20", reason: "x" },
      referral: { reason: "y" },
      coverage: [],
      entries: [],
      continuedLink: null,
    }),
    [],
  );
  assert.deepEqual(nextStepsReviewRows(), []);
});

test("review rows show the ticked sections, coverage, reporting and the completed follow-up", () => {
  const rows = nextStepsReviewRows({
    state: { bhcFollowUp: true, referToRhu: true, referralMultipleIssues: false },
    followUp: { date: "2026-10-20", time: "10:30", reason: "Recheck BP" },
    referral: { reason: "Needs workup", priority: "Urgent" },
    coverage: ["Cough", "Hypertension"],
    entries: [
      { id: "e1", name: "Dengue", reportIn: ["morbidity", "notifiable", "surveillance"] },
      { id: "e2", name: "Fever", reportIn: ["morbidity"] },
    ],
    continuedLink: { visitType: "follow_up_visit", followUpTaskId: 7, parentHealthRecordId: 31 },
  });
  const byLabel = Object.fromEntries(rows.map((row) => [row.label, row.value]));
  assert.deepEqual(
    rows.map((row) => row.label),
    ["BHC Follow-up", "RHU Referral", "Covers", "Reporting", "Completes follow-up"],
  );
  assert.equal(byLabel["BHC Follow-up"], "2026-10-20 · 10:30 · Recheck BP");
  assert.equal(byLabel["RHU Referral"], "Urgent · Needs workup");
  assert.equal(byLabel.Covers, "Cough, Hypertension");
  assert.equal(byLabel.Reporting, "Dengue — Morbidity · Notifiable · Surveillance\nFever — Morbidity");
  assert.equal(byLabel["Completes follow-up"], "FU-7");
});

test("review rows keep a ticked section that has no details", () => {
  const rows = nextStepsReviewRows({
    state: { bhcFollowUp: true, referToRhu: true, referralMultipleIssues: false },
    followUp: {},
    referral: {},
  });
  assert.deepEqual(rows, [
    { label: "BHC Follow-up", value: "Not scheduled" },
    { label: "RHU Referral", value: "Refer to RHU" },
  ]);
});

test("a converted draft adds an Earlier draft notes row, last, only when the notes are not blank", () => {
  const withNotes = nextStepsReviewRows({
    state: { bhcFollowUp: true, referToRhu: false, referralMultipleIssues: false },
    followUp: { date: "2026-10-20" },
    earlierDraftNotes: "  Cough x3 days\nNo fever  ",
  });
  assert.deepEqual(withNotes, [
    { label: "BHC Follow-up", value: "2026-10-20" },
    { label: "Earlier draft notes", value: "Cough x3 days\nNo fever" },
  ]);
  assert.deepEqual(nextStepsReviewRows({ earlierDraftNotes: "   " }), []);
  assert.deepEqual(nextStepsReviewRows({ earlierDraftNotes: "" }), []);
  assert.deepEqual(nextStepsReviewRows({ earlierDraftNotes: null }), []);
  assert.deepEqual(nextStepsReviewRows(), []);
});
