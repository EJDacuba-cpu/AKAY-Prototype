import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSESSMENT_STEP,
  NEXT_STEP,
  PROGRAMS_STEP,
  REVIEW_STEP,
  TREATMENT_STEP,
  VISIT_STEP,
  buildConsultationSteps,
  findFirstErrorStepKey,
  getErrorOwnerStepKey,
  getFormSequence,
  getGlobalStepKey,
  getProgramFormSteps,
  getStepOrder,
  pickErrorsForStep,
  programStepKey,
  resolveFormStep,
} from "./consultationSteps.js";

const keysOf = (steps) => steps.map((step) => step.key);
const MATERNAL = programStepKey("Maternal");
const TB = programStepKey("TB DOTS / TB Monitoring");
const FP = programStepKey("Family Planning");

test("General Consultation shows no Program Forms step at all", () => {
  const steps = buildConsultationSteps({ selectedPrograms: [], primaryProgram: "" });
  assert.deepEqual(keysOf(steps), [
    VISIT_STEP,
    ASSESSMENT_STEP,
    TREATMENT_STEP,
    NEXT_STEP,
    REVIEW_STEP,
  ]);
});

test("programs collapse into ONE global Program Forms step, never one each", () => {
  const steps = buildConsultationSteps({
    selectedPrograms: ["Maternal", "TB", "Family Planning"],
    primaryProgram: "Maternal",
  });
  assert.deepEqual(keysOf(steps), [
    VISIT_STEP,
    PROGRAMS_STEP,
    ASSESSMENT_STEP,
    TREATMENT_STEP,
    NEXT_STEP,
    REVIEW_STEP,
  ]);
  // The global list is the same length whether there are 1 or 3 programs.
  assert.equal(
    buildConsultationSteps({ selectedPrograms: ["TB"], primaryProgram: "TB" }).length,
    steps.length,
  );
});

test("the nested program list puts the primary first, then selected order", () => {
  const forms = getProgramFormSteps(["TB", "Maternal", "Family Planning"], "Maternal");
  assert.deepEqual(forms.map((step) => step.classification), [
    "Maternal",
    "TB DOTS / TB Monitoring",
    "Family Planning",
  ]);
  assert.deepEqual(forms.map((step) => step.role), [
    "Primary Program",
    "Additional Program",
    "Additional Program",
  ]);
  assert.deepEqual(
    forms.map((step) => `${step.programNumber} of ${step.programCount}`),
    ["1 of 3", "2 of 3", "3 of 3"],
  );
});

test("Hypertension and Diabetes share one nested form", () => {
  const forms = getProgramFormSteps(["Diabetes", "Maternal", "Hypertension"], "Maternal");
  assert.equal(forms.length, 2);
  assert.deepEqual(forms[1].programs, ["Diabetes", "Hypertension"]);
});

test("a primary that is not selected falls back to the first selected program", () => {
  const forms = getProgramFormSteps(["TB", "Maternal"], "EPI");
  assert.equal(forms[0].classification, "TB DOTS / TB Monitoring");
  assert.equal(forms[0].isPrimary, true);
});

test("unknown program keys never produce a form", () => {
  assert.deepEqual(getProgramFormSteps(["Nonsense"], "Nonsense"), []);
});

test("the form sequence walks each program, then Assessment and Treatment", () => {
  const forms = getProgramFormSteps(["Maternal", "TB"], "Maternal");
  assert.deepEqual(getFormSequence(forms), [MATERNAL, TB, ASSESSMENT_STEP, TREATMENT_STEP]);
  assert.deepEqual(getFormSequence([]), [ASSESSMENT_STEP, TREATMENT_STEP]);
});

test("every program screen maps back to the one Program Forms global step", () => {
  assert.equal(getGlobalStepKey(MATERNAL), PROGRAMS_STEP);
  assert.equal(getGlobalStepKey(FP), PROGRAMS_STEP);
  assert.equal(getGlobalStepKey(TREATMENT_STEP), TREATMENT_STEP);
  assert.equal(getGlobalStepKey(VISIT_STEP), VISIT_STEP);
});

test("a stored screen that no longer exists falls back to the first one", () => {
  const sequence = getFormSequence(getProgramFormSteps(["Maternal", "TB"], "Maternal"));
  assert.equal(resolveFormStep(TB, sequence), TB);
  assert.equal(resolveFormStep(FP, sequence), MATERNAL);
  assert.equal(resolveFormStep("", sequence), MATERNAL);
  assert.equal(resolveFormStep(TREATMENT_STEP, sequence), TREATMENT_STEP);
});

test("step order spans Current Visit through Review, programs included", () => {
  const forms = getProgramFormSteps(["Maternal", "TB"], "Maternal");
  assert.deepEqual(getStepOrder(forms), [
    VISIT_STEP,
    MATERNAL,
    TB,
    ASSESSMENT_STEP,
    TREATMENT_STEP,
    NEXT_STEP,
    REVIEW_STEP,
  ]);
});

test("each validation error is owned by the screen that shows its field", () => {
  assert.equal(getErrorOwnerStepKey("chiefComplaint"), VISIT_STEP);
  assert.equal(getErrorOwnerStepKey("summaryOfPresentIllness"), VISIT_STEP);
  assert.equal(getErrorOwnerStepKey("hypertensionDiabeticData.bp"), VISIT_STEP);
  assert.equal(
    getErrorOwnerStepKey("hypertensionDiabeticData.conditionType"),
    programStepKey("Hypertension / Diabetic Monitoring"),
  );
  assert.equal(getErrorOwnerStepKey("tbData.diagnosis.tbCaseNumber"), TB);
  assert.equal(getErrorOwnerStepKey("familyPlanningMethodUsed"), FP);
  assert.equal(getErrorOwnerStepKey("vaccineEntries"), programStepKey("Immunization"));
  assert.equal(getErrorOwnerStepKey("dispensedMedicines"), TREATMENT_STEP);
  assert.equal(getErrorOwnerStepKey("followUpDate"), NEXT_STEP);
  assert.equal(getErrorOwnerStepKey("somethingElse"), null);
});

test("per-screen validation only blocks on that screen's own errors", () => {
  const errors = {
    "tbData.diagnosis.tbCaseNumber": "TB case number is required.",
    dispensedMedicines: "Click Add Medicine.",
    familyPlanningMethodUsed: "Method is required.",
  };
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, TB)), [
    "tbData.diagnosis.tbCaseNumber",
  ]);
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, TREATMENT_STEP)), [
    "dispensedMedicines",
  ]);
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, ASSESSMENT_STEP)), []);
});

test("the earliest failing screen is revealed, not object key order", () => {
  const order = getStepOrder(getProgramFormSteps(["Maternal", "TB"], "Maternal"));
  assert.equal(
    findFirstErrorStepKey(
      { dispensedMedicines: "x", "tbData.phases.intensiveStart": "y" },
      order,
    ),
    TB,
  );
  assert.equal(findFirstErrorStepKey({}, order), "");
});

test("the step indicator counts 5 steps for General, 6 with programs", () => {
  const general = buildConsultationSteps({ selectedPrograms: [], primaryProgram: "" });
  assert.equal(general.length, 5);
  assert.equal(general.findIndex((s) => s.key === ASSESSMENT_STEP) + 1, 2);
  assert.equal(general[1].label, "Clinical Assessment");

  // Three programs still add exactly one step, not three.
  const withPrograms = buildConsultationSteps({
    selectedPrograms: ["Maternal", "TB", "Family Planning"],
    primaryProgram: "Maternal",
  });
  assert.equal(withPrograms.length, 6);
  assert.equal(withPrograms.findIndex((s) => s.key === PROGRAMS_STEP) + 1, 2);
  assert.equal(withPrograms[1].label, "Program Forms");
  assert.equal(withPrograms.findIndex((s) => s.key === ASSESSMENT_STEP) + 1, 3);
});

test("General Consultation goes from Current Visit straight to Assessment", () => {
  const sequence = getFormSequence(getProgramFormSteps([], ""));
  assert.equal(sequence[0], ASSESSMENT_STEP);

  const order = getStepOrder(getProgramFormSteps([], ""));
  assert.deepEqual(order, [
    VISIT_STEP,
    ASSESSMENT_STEP,
    TREATMENT_STEP,
    NEXT_STEP,
    REVIEW_STEP,
  ]);
});

test("with programs, Current Visit is followed by the first program form", () => {
  const forms = getProgramFormSteps(["TB", "Maternal"], "Maternal");
  const order = getStepOrder(forms);
  assert.equal(order[1], MATERNAL);      // primary first
  assert.equal(order[2], TB);
  assert.equal(order[3], ASSESSMENT_STEP); // last program -> Assessment
});

test("Next from Current Visit lands on a real screen key, not a step object", () => {
  // Regression: the handler once passed the global step list to resolveFormStep,
  // which handed back a step OBJECT. Navigation then could not resolve a phase
  // and silently did nothing, so Next appeared dead on both consultation types.
  for (const config of [
    { selectedPrograms: [], primaryProgram: "" },
    { selectedPrograms: ["TB", "Maternal"], primaryProgram: "Maternal" },
  ]) {
    const sequence = getFormSequence(
      getProgramFormSteps(config.selectedPrograms, config.primaryProgram),
    );
    const destination = sequence[0];

    assert.equal(typeof destination, "string");
    assert.ok(sequence.includes(destination));
    assert.ok(getStepOrder(getProgramFormSteps(config.selectedPrograms, config.primaryProgram)).includes(destination));
  }

  // General goes straight to Assessment; with programs, to the primary one.
  assert.equal(getFormSequence(getProgramFormSteps([], ""))[0], ASSESSMENT_STEP);
  assert.equal(
    getFormSequence(getProgramFormSteps(["TB", "Maternal"], "Maternal"))[0],
    MATERNAL,
  );
});
