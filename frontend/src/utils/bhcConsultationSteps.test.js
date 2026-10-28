import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSESSMENT_STEP,
  BHC_STEP_OPTIONS,
  HISTORY_STEP,
  INTERVIEW_STEP,
  MONITORING_STEP,
  NEXT_STEP,
  OUTCOME_STEP,
  PROGRAMS_STEP,
  REVIEW_STEP,
  EXIT_STEP,
  buildConsultationSteps,
  findFirstErrorStepKey,
  getErrorOwnerStepKey,
  getFormSequence,
  getNextStepKey,
  getPreviousStepKey,
  getProgramFormSteps,
  getStepOrder,
  pickErrorsForStep,
  programStepKey,
  resolveFormStep,
  resolveRestoredPosition,
} from "./consultationSteps.js";

const MATERNAL = programStepKey("Maternal");
const BHC = BHC_STEP_OPTIONS;

/* ── BHC: no Patient History step ─────────────────────────────────────── */

test("BHC opts out of the Patient History step; the option is frozen", () => {
  assert.equal(BHC.includeHistory, false);
  assert.ok(Object.isFrozen(BHC));
});

test("BHC steps go Patient Interview -> Physical Examination with no History step", () => {
  const programSteps = getProgramFormSteps(["Maternal"], "Maternal");
  const keys = buildConsultationSteps({ programSteps, monitoringDetailKeys: ["tb_dots"], ...BHC }).map((s) => s.key);
  assert.deepEqual(keys, [
    INTERVIEW_STEP,
    ASSESSMENT_STEP,
    PROGRAMS_STEP,
    NEXT_STEP,
    MONITORING_STEP,
    REVIEW_STEP,
  ]);
  assert.deepEqual(getFormSequence(programSteps, BHC), [INTERVIEW_STEP, ASSESSMENT_STEP, MATERNAL]);
  assert.deepEqual(getStepOrder(programSteps, ["tb_dots"], BHC), [
    INTERVIEW_STEP,
    ASSESSMENT_STEP,
    MATERNAL,
    NEXT_STEP,
    MONITORING_STEP,
    REVIEW_STEP,
  ]);
});

test("BHC Next and Previous skip straight between Interview and Physical Examination", () => {
  const sequence = getFormSequence([], BHC);
  assert.equal(getNextStepKey(sequence, INTERVIEW_STEP), ASSESSMENT_STEP);
  assert.equal(getPreviousStepKey(sequence, ASSESSMENT_STEP), INTERVIEW_STEP);
  assert.equal(getPreviousStepKey(sequence, INTERVIEW_STEP), EXIT_STEP);
  assert.equal(getNextStepKey(sequence, ASSESSMENT_STEP), NEXT_STEP);
});

test("BHC: Informant, Similar Illness and staged background errors belong to Patient Interview", () => {
  for (const key of [
    "informant.relation",
    "informant.name",
    "similar_illness",
    "similar_illness.answer",
    "background_update.sections.medical.hospitalizations.items.0.type",
    "background_update.reviewed",
  ]) {
    assert.equal(getErrorOwnerStepKey(key, BHC), INTERVIEW_STEP, key);
  }
  // Every other owner is unchanged.
  assert.equal(getErrorOwnerStepKey("chiefComplaint", BHC), INTERVIEW_STEP);
  assert.equal(getErrorOwnerStepKey("pulse", BHC), ASSESSMENT_STEP);
  assert.equal(getErrorOwnerStepKey("dispensedMedicines", BHC), NEXT_STEP);
  assert.equal(getErrorOwnerStepKey("actionsTaken", BHC), NEXT_STEP);
  assert.equal(getErrorOwnerStepKey("noInterventionReason", BHC), NEXT_STEP);
  assert.equal(getErrorOwnerStepKey("careOutcome", BHC), NEXT_STEP);
  assert.equal(getErrorOwnerStepKey("followUpDate", BHC), NEXT_STEP);
  assert.equal(getErrorOwnerStepKey("somethingElse", BHC), null);
});

test("BHC: a server error on the informant routes back to Patient Interview, never to a missing History step", () => {
  const order = getStepOrder([], [], BHC);
  assert.equal(findFirstErrorStepKey({ pulse: "x", "informant.relation": "y" }, order, BHC), INTERVIEW_STEP);
  assert.equal(findFirstErrorStepKey({ "similar_illness.answer": "y" }, order, BHC), INTERVIEW_STEP);
  assert.equal(
    findFirstErrorStepKey({ "background_update.sections.family.familyHistory.items.0.condition": "x" }, order, BHC),
    INTERVIEW_STEP,
  );
  const errors = { chiefComplaint: "a", "informant.relation": "b", pulse: "c" };
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, INTERVIEW_STEP, BHC)), ["chiefComplaint", "informant.relation"]);
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, HISTORY_STEP, BHC)), []);
});

test("BHC: a legacy draft saved on Patient History reopens on Patient Interview", () => {
  assert.deepEqual(resolveRestoredPosition({ wizardPhase: "form", formStep: HISTORY_STEP }, BHC), {
    phase: "form",
    formStep: INTERVIEW_STEP,
  });
  // ...and is never left pointing at a screen that no longer exists.
  assert.equal(resolveFormStep(HISTORY_STEP, getFormSequence([], BHC)), INTERVIEW_STEP);
  // Every other saved screen still reopens where it was left.
  assert.deepEqual(resolveRestoredPosition({ wizardPhase: "form", formStep: ASSESSMENT_STEP }, BHC), {
    phase: "form",
    formStep: ASSESSMENT_STEP,
  });
  assert.deepEqual(resolveRestoredPosition({ wizardPhase: "form", formStep: MATERNAL }, BHC), {
    phase: "form",
    formStep: MATERNAL,
  });
  assert.equal(resolveRestoredPosition({ wizardPhase: "next", formStep: HISTORY_STEP }, BHC).phase, "next");
});

/* ── RHU / default callers keep the History step ──────────────────────── */

test("the default sequence (RHU and every other caller) is unchanged", () => {
  assert.deepEqual(getFormSequence([]), [INTERVIEW_STEP, HISTORY_STEP, ASSESSMENT_STEP]);
  assert.deepEqual(getFormSequence([], { includeHistory: true }), [INTERVIEW_STEP, HISTORY_STEP, ASSESSMENT_STEP]);
  assert.deepEqual(
    buildConsultationSteps({ programSteps: [] }).map((s) => s.key),
    [INTERVIEW_STEP, HISTORY_STEP, ASSESSMENT_STEP, NEXT_STEP, OUTCOME_STEP, REVIEW_STEP],
  );
  assert.deepEqual(getStepOrder([], []).slice(0, 3), [INTERVIEW_STEP, HISTORY_STEP, ASSESSMENT_STEP]);
  assert.equal(getErrorOwnerStepKey("informant.relation"), HISTORY_STEP);
  assert.equal(findFirstErrorStepKey({ "informant.relation": "x", pulse: "y" }, getStepOrder([], [])), HISTORY_STEP);
  assert.deepEqual(resolveRestoredPosition({ wizardPhase: "form", formStep: HISTORY_STEP }), {
    phase: "form",
    formStep: HISTORY_STEP,
  });
});
