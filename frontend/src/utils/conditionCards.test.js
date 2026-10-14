import test from "node:test";
import assert from "node:assert/strict";
import { conditionCardErrors, conditionCardReviewRows, restoreSharedReferralDraft, savedReferralSummary, sharedConditionEntries } from "./conditionCards.js";
import { recordReportingLines, reportingEntryDraft, reportingEntryPayload, restoreReportingEntries } from "./reportingEntries.js";
import { normalizeDiagnoses } from "./diagnoses.js";
import { getErrorOwnerStepKey, remapServerErrorKeys, NEXT_STEP, OUTCOME_STEP } from "./consultationSteps.js";

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

test("empty conditions block continuing and final submission on the conditions screen", () => {
  const errors = conditionCardErrors([]);
  assert.deepEqual(errors, { diagnoses: "Add at least one condition before continuing." });
  assert.deepEqual(conditionCardErrors([], { referralDetails: true }), errors);
  assert.equal(getErrorOwnerStepKey("diagnoses"), NEXT_STEP);
  assert.deepEqual(remapServerErrorKeys(errors), errors);
  // Adding a valid card clears the collection error; removing it restores it.
  assert.deepEqual(conditionCardErrors([entry]), {});
  assert.deepEqual(conditionCardErrors([entry].filter((item) => item.id !== entry.id)), errors);
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

test("outcome is chosen explicitly and referral fields are checked only on Care and Outcome", () => {
  const blank = { ...entry, clinicalOutcome: "" };
  assert.equal(conditionCardErrors([blank])["reportingEntry.case-a.clinicalOutcome"], "Choose a clinical outcome.");
  const unfinished = { ...entry, referral: {} };
  assert.deepEqual(conditionCardErrors([unfinished]), {});
  assert.equal(Object.keys(conditionCardErrors([unfinished], { referralDetails: true })).length, 3);
});

test("server errors on a specific condition reach its visible field on the correct screen", () => {
  const errors = remapServerErrorKeys({ "diagnoses.0.referral.receivingRhuId": "Unauthorized RHU" }, [entry]);
  assert.deepEqual(errors, { "reportingEntry.case-a.referral.receivingRhuId": "Unauthorized RHU" });
  assert.equal(getErrorOwnerStepKey(Object.keys(errors)[0]), OUTCOME_STEP);
  assert.equal(getErrorOwnerStepKey("reportingEntry.case-a.clinicalOutcome"), NEXT_STEP);
});

test("a partially submitted consultation reports both submitted and held referrals", () => {
  const result = savedReferralSummary({ referrals: [{ tracking_id: "REF-1" }], monitoring_data: { conditionReferralOutcomes: [{ entryId: "a", trackingId: "REF-1" }, { entryId: "b", holdId: 4 }] } });
  assert.equal(result.submittedReferralCount, 1);
  assert.equal(result.heldReferralCount, 1);
  assert.equal(result.awaitingDoctor, true);
  assert.equal(result.referralSubmitted, true);
});
