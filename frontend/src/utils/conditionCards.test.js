import test from "node:test";
import assert from "node:assert/strict";
import { applyEntryCareOutcome, conditionCardErrors, conditionCardReviewRows, entryCareOutcome, restoreSharedReferralDraft, savedReferralSummary, sharedConditionEntries } from "./conditionCards.js";
import { recordReportingLines, reportingEntryDraft, reportingEntryErrors, reportingEntryPayload, restoreReportingEntries } from "./reportingEntries.js";
import { normalizeDiagnoses } from "./diagnoses.js";
import { BHC_STEP_OPTIONS, getErrorOwnerStepKey, remapServerErrorKeys, NEXT_STEP, OUTCOME_STEP } from "./consultationSteps.js";

const referral = { urgencyLevel: "Priority", receivingRhuId: "7", reasonForReferral: "Needs physician assessment" };
const entry = { id: "case-a", name: "Suspected hypertension", reportIn: ["morbidity", "surveillance"], clinicalOutcome: "refer_to_rhu", referral };

test("shared submissions strip individual referral details without mutating drafts or outcomes", () => {
  const local = { ...entry, id: "local", name: "Local concern", clinicalOutcome: "managed_at_bhc" };
  const result = reportingEntryPayload(sharedConditionEntries([entry, local]));
  assert.equal(result[0].clinicalOutcome, "refer_to_rhu");
  assert.equal(result[1].clinicalOutcome, "managed_at_bhc");
  assert.equal(result.some((item) => Object.hasOwn(item, "referral")), false);
  assert.equal(conditionCardReviewRows(result).length, 2);
  assert.deepEqual(entry.referral, referral);
  assert.deepEqual(conditionCardErrors(result), {});
});

test("new shared drafts preserve the chosen common values exactly on repeated resume", () => {
  const payload = { sharedConditionReferral: true, receivingRhuId: "8", referralForm: { urgencyLevel: "Routine", reasonForReferral: "Shared reason" }, diagnoses: [entry] };
  const restored = restoreSharedReferralDraft(payload);
  assert.deepEqual(restored, { receivingRhuId: "8", referralForm: payload.referralForm });
  assert.deepEqual(restoreSharedReferralDraft({ ...payload, ...restored }), restored);
});

test("earlier per-card drafts keep their reasons and require selection for conflicting RHUs and priorities", () => {
  const other = { ...entry, id: "b", name: "Second concern", referral: { receivingRhuId: "8", urgencyLevel: "Routine", reasonForReferral: "Second reason" } };
  const restored = restoreSharedReferralDraft({ diagnoses: [entry, other] });
  assert.equal(restored.receivingRhuId, "");
  assert.equal(restored.referralForm.urgencyLevel, "");
  assert.match(restored.referralForm.reasonForReferral, /Suspected hypertension: Needs physician assessment/);
  assert.match(restored.referralForm.reasonForReferral, /Second concern: Second reason/);
});

test("compatible old condition referral drafts inherit their one RHU and priority", () => {
  const restored = restoreSharedReferralDraft({ diagnoses: [entry], referralForm: { urgencyLevel: "Routine" } });
  assert.equal(restored.receivingRhuId, "7");
  assert.equal(restored.referralForm.urgencyLevel, "Priority");
  const legacy = { receivingRhuId: "4", referralForm: { reasonForReferral: "Existing visit referral" } };
  assert.deepEqual(restoreSharedReferralDraft(legacy), legacy);
});

test("empty conditions are allowed for service-only visits; added conditions are still validated", () => {
  assert.deepEqual(conditionCardErrors([]), {});
  assert.deepEqual(conditionCardErrors([], { referralDetails: true }), {});
  assert.deepEqual(conditionCardErrors([], { allowEmpty: false }), { diagnoses: "Add at least one condition before continuing." });
  assert.equal(getErrorOwnerStepKey("diagnoses"), NEXT_STEP);
  assert.deepEqual(conditionCardErrors([entry]), {});
  const unnamed = { id: "starter", name: "", reportIn: [] };
  assert.deepEqual(conditionCardErrors([unnamed]), {});
  const blank = { ...entry, clinicalOutcome: "" };
  assert.equal(conditionCardErrors([blank])["reportingEntry.case-a.clinicalOutcome"], "Choose a care outcome.");
});

test("a blank starter and extra empty rows are ignored while named concerns keep their reports", () => {
  const rows = [
    { id: "starter", name: "", reportIn: [] },
    { id: "a", name: "Hypertension", reportIn: ["morbidity"], clinicalOutcome: "managed_at_bhc" },
    { id: "extra", name: "  ", reportIn: [] },
    { id: "b", name: "Cough", reportIn: ["surveillance"], clinicalOutcome: "managed_at_bhc" },
  ];
  assert.deepEqual(conditionCardErrors(rows), {});
  assert.deepEqual(reportingEntryErrors(rows), {});
  assert.deepEqual(reportingEntryPayload(rows).map((item) => item.id), ["a", "b"]);
  assert.deepEqual(reportingEntryPayload(rows).map((item) => item.reportIn), [["morbidity"], ["surveillance"]]);
});

test("condition referral details survive draft restore and the official record serializer", () => {
  const restored = restoreReportingEntries(reportingEntryDraft([entry]));
  assert.deepEqual(restored, [entry]);
  assert.deepEqual(normalizeDiagnoses(reportingEntryPayload(restored)), [entry]);
  const line = recordReportingLines({ diagnoses: restored })[0].text;
  assert.match(line, /Refer to RHU/);
  assert.match(line, /Needs physician assessment/);
});

test("switching to local care keeps the hidden referral in drafts but excludes it from official submission", () => {
  const managed = { ...entry, clinicalOutcome: "managed_at_bhc" };
  assert.deepEqual(reportingEntryDraft([managed])[0].referral, referral);
  assert.equal(Object.hasOwn(reportingEntryPayload([managed])[0], "referral"), false);
  assert.deepEqual(conditionCardErrors([managed], { referralDetails: true }), {});
});

test("each named concern keeps its own care outcome and reporting classification", () => {
  const cough = { id: "c1", name: "Cough", reportIn: ["morbidity"], clinicalOutcome: "managed_at_bhc" };
  const htn = { ...entry, id: "c2", name: "Suspected hypertension", reportIn: ["notifiable", "surveillance"] };
  const schedules = [{ purposeKey: "entry:c1", purpose: "Cough review", date: "2026-11-04", sourceEntryId: "c1" }];
  assert.equal(entryCareOutcome(cough, schedules), "bhc_follow_up");
  assert.equal(entryCareOutcome(htn, schedules), "refer_to_rhu");
  assert.equal(entryCareOutcome({ ...cough, clinicalOutcome: "managed_at_bhc" }, []), "managed_at_bhc");
  assert.equal(applyEntryCareOutcome(cough, "refer_to_rhu").clinicalOutcome, "refer_to_rhu");
  assert.equal(applyEntryCareOutcome(htn, "managed_at_bhc").clinicalOutcome, "managed_at_bhc");
  assert.equal(applyEntryCareOutcome(htn, "bhc_follow_up").clinicalOutcome, "managed_at_bhc");
  const errors = conditionCardErrors([cough, htn], { schedules });
  assert.deepEqual(errors, {});
  const rows = conditionCardReviewRows([cough, htn], schedules);
  assert.match(rows[0].value, /BHC Follow-up/);
  assert.match(rows[0].value, /Morbidity/);
  assert.match(rows[1].value, /Refer to RHU/);
  assert.match(rows[1].value, /Notifiable/);
  assert.match(rows[1].value, /Surveillance/);
});

test("removing or clearing a concern does not rewrite the other row's outcome", () => {
  const cough = { id: "c1", name: "Cough", reportIn: ["morbidity"], clinicalOutcome: "managed_at_bhc" };
  const htn = { ...entry };
  const remaining = [htn];
  assert.equal(entryCareOutcome(remaining[0], []), "refer_to_rhu");
  assert.equal(remaining[0].reportIn.join(","), "morbidity,surveillance");
  assert.deepEqual(conditionCardErrors(remaining), {});
});

test("unfinished referral details on a referred concern still fail when details are required", () => {
  const unfinished = { ...entry, referral: {} };
  assert.deepEqual(conditionCardErrors([unfinished]), {});
  assert.equal(Object.keys(conditionCardErrors([unfinished], { referralDetails: true })).length, 3);
});

test("server errors on a specific condition reach its visible field on the correct screen", () => {
  const errors = remapServerErrorKeys({ "diagnoses.0.referral.receivingRhuId": "Unauthorized RHU" }, [entry]);
  assert.deepEqual(errors, { "reportingEntry.case-a.referral.receivingRhuId": "Unauthorized RHU" });
  assert.equal(getErrorOwnerStepKey(Object.keys(errors)[0]), OUTCOME_STEP);
  assert.equal(getErrorOwnerStepKey(Object.keys(errors)[0], BHC_STEP_OPTIONS), NEXT_STEP);
  assert.equal(getErrorOwnerStepKey("followUpDate", BHC_STEP_OPTIONS), NEXT_STEP);
});

test("a partially submitted consultation reports both submitted and held referrals", () => {
  const result = savedReferralSummary({ referrals: [{ tracking_id: "REF-1" }], monitoring_data: { conditionReferralOutcomes: [{ entryId: "a", trackingId: "REF-1" }, { entryId: "b", holdId: 4 }] } });
  assert.equal(result.submittedReferralCount, 1);
  assert.equal(result.heldReferralCount, 1);
  assert.equal(result.awaitingDoctor, true);
  assert.equal(result.referralSubmitted, true);
});
