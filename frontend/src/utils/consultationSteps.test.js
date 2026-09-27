import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSESSMENT_STEP,
  INTERVIEW_STEP,
  NEXT_STEP,
  PROGRAMS_STEP,
  REVIEW_STEP,
  EXIT_STEP,
  TREATMENT_STEP,
  buildConsultationSteps,
  deferUntilProgramDecision,
  findFirstErrorStepKey,
  getErrorOwnerStepKey,
  getFormSequence,
  getGlobalStepKey,
  getNextStepKey,
  getPreviousStepKey,
  getProgramFormSteps,
  getStepOrder,
  pickErrorsForStep,
  programStepKey,
  resolveFormStep,
  resolveRestoredPosition,
  resolveStepHeading,
} from "./consultationSteps.js";

const keysOf = (steps) => steps.map((step) => step.key);
const MATERNAL = programStepKey("Maternal");
const TB = programStepKey("TB DOTS / TB Monitoring");
const FP = programStepKey("Family Planning");
const EPI = programStepKey("Immunization");

/** Every screen from Interview to Review, following Next the way the page does. */
function walkForward(selectedPrograms, primaryProgram) {
  const sequence = getFormSequence(getProgramFormSteps(selectedPrograms, primaryProgram));
  const screens = [sequence[0]];
  let current = sequence[0];
  while (current !== NEXT_STEP) {
    current = getNextStepKey(sequence, current);
    screens.push(current);
  }
  return [...screens, REVIEW_STEP];
}

/* ── The flows ───────────────────────────────────────────────────────── */

test("GENERAL CONSULTATION: Interview & Vitals → Assessment → Treatment → Next Care → Review", () => {
  assert.deepEqual(walkForward([], ""), [
    INTERVIEW_STEP,
    ASSESSMENT_STEP,
    TREATMENT_STEP,
    NEXT_STEP,
    REVIEW_STEP,
  ]);
});

test("MATERNAL: the program form sits between Assessment and Treatment", () => {
  assert.deepEqual(walkForward(["Maternal"], "Maternal"), [
    INTERVIEW_STEP,
    ASSESSMENT_STEP,
    MATERNAL,
    TREATMENT_STEP,
    NEXT_STEP,
    REVIEW_STEP,
  ]);
});

test("MATERNAL + TB: Program 1 Maternal, Program 2 TB, then Treatment", () => {
  assert.deepEqual(walkForward(["Maternal", "TB"], "Maternal"), [
    INTERVIEW_STEP,
    ASSESSMENT_STEP,
    MATERNAL,
    TB,
    TREATMENT_STEP,
    NEXT_STEP,
    REVIEW_STEP,
  ]);
});

test("NO PROGRAM: the Program / Service Details step is skipped entirely", () => {
  const steps = buildConsultationSteps({ selectedPrograms: [], primaryProgram: "" });
  assert.equal(keysOf(steps).includes(PROGRAMS_STEP), false);
  assert.equal(getNextStepKey(getFormSequence([]), ASSESSMENT_STEP), TREATMENT_STEP);
});

test("BACKWARD: Previous reverses the exact forward order, out to patient context", () => {
  const programs = getProgramFormSteps(["Maternal", "TB"], "Maternal");
  const sequence = getFormSequence(programs);

  const back = [];
  let current = TREATMENT_STEP;
  while (current !== EXIT_STEP) {
    back.push(current);
    current = getPreviousStepKey(sequence, current);
  }
  back.push(EXIT_STEP);

  assert.deepEqual(back, [
    TREATMENT_STEP,
    TB, // last program
    MATERNAL, // previous program
    ASSESSMENT_STEP,
    INTERVIEW_STEP,
    EXIT_STEP,
  ]);
});

test("Previous from the FIRST program returns to Clinical Assessment", () => {
  const sequence = getFormSequence(getProgramFormSteps(["TB", "Maternal"], "Maternal"));
  assert.equal(getPreviousStepKey(sequence, MATERNAL), ASSESSMENT_STEP);
  assert.equal(getPreviousStepKey(sequence, TB), MATERNAL);
});

test("Next from the LAST program goes to Treatment & Management", () => {
  const sequence = getFormSequence(getProgramFormSteps(["TB", "Maternal"], "Maternal"));
  assert.equal(getNextStepKey(sequence, TB), TREATMENT_STEP);
});

test("Previous from Interview exits to patient context", () => {
  assert.equal(getPreviousStepKey(getFormSequence([]), INTERVIEW_STEP), EXIT_STEP);
});

test("Next from Treatment goes to Next Care Decision", () => {
  assert.equal(getNextStepKey(getFormSequence([]), TREATMENT_STEP), NEXT_STEP);
});

/* ── Global steps ────────────────────────────────────────────────────── */

test("the global steps read in the new order with the new names", () => {
  const steps = buildConsultationSteps({
    selectedPrograms: ["Maternal", "TB", "Family Planning"],
    primaryProgram: "Maternal",
  });
  assert.deepEqual(
    steps.map((step) => step.label),
    [
      "Concern & Vital Signs",
      "Physical Examination",
      "Program / Service Details",
      "BHC Assessment & Actions Taken",
      "Disposition",
      "Review & Confirm",
    ],
  );
});

test("programs collapse into ONE global Program / Service Details step", () => {
  const three = buildConsultationSteps({
    selectedPrograms: ["Maternal", "TB", "Family Planning"],
    primaryProgram: "Maternal",
  });
  const one = buildConsultationSteps({ selectedPrograms: ["TB"], primaryProgram: "TB" });
  assert.equal(three.length, one.length);
  assert.equal(keysOf(three).filter((key) => key === PROGRAMS_STEP).length, 1);
});

test("every form screen belongs to the form phase", () => {
  const steps = buildConsultationSteps({ selectedPrograms: ["TB"], primaryProgram: "TB" });
  for (const key of [INTERVIEW_STEP, ASSESSMENT_STEP, PROGRAMS_STEP, TREATMENT_STEP]) {
    assert.equal(steps.find((step) => step.key === key).phase, "form", key);
  }
  assert.equal(steps.find((step) => step.key === NEXT_STEP).phase, "next");
  assert.equal(steps.find((step) => step.key === REVIEW_STEP).phase, "review");
});

test("every program screen maps back to the one Program / Service Details step", () => {
  assert.equal(getGlobalStepKey(MATERNAL), PROGRAMS_STEP);
  assert.equal(getGlobalStepKey(FP), PROGRAMS_STEP);
  assert.equal(getGlobalStepKey(INTERVIEW_STEP), INTERVIEW_STEP);
});

test("step order spans Interview through Review, programs after Assessment", () => {
  assert.deepEqual(getStepOrder(getProgramFormSteps(["Maternal", "TB"], "Maternal")), [
    INTERVIEW_STEP,
    ASSESSMENT_STEP,
    MATERNAL,
    TB,
    TREATMENT_STEP,
    NEXT_STEP,
    REVIEW_STEP,
  ]);
});

/* ── Program ordering (unchanged behaviour) ──────────────────────────── */

test("the nested program list puts the primary first, then selected order", () => {
  const forms = getProgramFormSteps(["TB", "Maternal", "Family Planning"], "Maternal");
  assert.deepEqual(forms.map((step) => step.classification), [
    "Maternal",
    "TB DOTS / TB Monitoring",
    "Family Planning",
  ]);
  assert.deepEqual(
    forms.map((step) => `${step.programNumber} of ${step.programCount}`),
    ["1 of 3", "2 of 3", "3 of 3"],
  );
});

test("removed programs never produce a form", () => {
  assert.deepEqual(getProgramFormSteps(["Hypertension", "Diabetes"], "Hypertension"), []);
  assert.deepEqual(getProgramFormSteps(["Diabetes", "Maternal"], "Diabetes").map((step) => step.classification), ["Maternal"]);
});

test("a primary that is not selected falls back to the first selected program", () => {
  const forms = getProgramFormSteps(["TB", "Maternal"], "EPI");
  assert.equal(forms[0].classification, "TB DOTS / TB Monitoring");
  assert.equal(forms[0].isPrimary, true);
});

test("unknown program keys never produce a form", () => {
  assert.deepEqual(getProgramFormSteps(["Nonsense"], "Nonsense"), []);
});

test("a stored screen that no longer exists falls back to Interview", () => {
  const sequence = getFormSequence(getProgramFormSteps(["Maternal", "TB"], "Maternal"));
  assert.equal(resolveFormStep(TB, sequence), TB);
  assert.equal(resolveFormStep(FP, sequence), INTERVIEW_STEP); // deselected program
  assert.equal(resolveFormStep("", sequence), INTERVIEW_STEP);
  assert.equal(resolveFormStep("visit", sequence), INTERVIEW_STEP); // old Current Visit key
});

/* ── Headings ────────────────────────────────────────────────────────── */

const SUBTITLES = {
  [INTERVIEW_STEP]: "Record the patient's reason for visit and present illness.",
  [ASSESSMENT_STEP]: "Document the examination findings and initial assessment for this visit.",
  [NEXT_STEP]: "What should be done next?",
};

function headingFor(stepKey, selectedPrograms, primaryProgram = "", activeIndex = 0) {
  const programSteps = getProgramFormSteps(selectedPrograms, primaryProgram);
  return resolveStepHeading({
    currentGlobalStepKey: getGlobalStepKey(stepKey),
    // The page derives this from formStep, which can point at a program while
    // another screen shows - exactly the case the gating exists for.
    activeProgramStep: programSteps[activeIndex] || null,
    steps: buildConsultationSteps({ selectedPrograms, primaryProgram }),
    subtitles: SUBTITLES,
  });
}

for (const [label, programs, primary] of [
  ["General Consultation", [], ""],
  ["Maternal / Prenatal", ["Maternal"], "Maternal"],
  ["TB", ["TB"], "TB"],
  ["Family Planning", ["Family Planning"], "Family Planning"],
  ["EPI", ["EPI"], "EPI"],
  ["several programs", ["TB", "Maternal"], "Maternal"],
]) {
  test(`Interview and Assessment keep their own headings with ${label}`, () => {
    // Guard against a vacuous pass: with programs selected there really is a
    // program step the heading could wrongly pick up.
    assert.equal(getProgramFormSteps(programs, primary).length > 0, programs.length > 0);

    assert.deepEqual(headingFor(INTERVIEW_STEP, programs, primary), {
      title: "Concern & Vital Signs",
      subtitle: SUBTITLES[INTERVIEW_STEP],
    });
    assert.deepEqual(headingFor(ASSESSMENT_STEP, programs, primary), {
      title: "Physical Examination",
      subtitle: SUBTITLES[ASSESSMENT_STEP],
    });
  });
}

test("a single program shows just its own title", () => {
  const heading = headingFor(MATERNAL, ["Maternal"], "Maternal");
  assert.equal(heading.title, "Prenatal");
  assert.equal(
    heading.subtitle,
    "Record the patient's pregnancy and obstetric information for this prenatal consultation.",
  );
});

test("several programs say where in the set the form is", () => {
  assert.equal(
    headingFor(MATERNAL, ["Maternal", "TB"], "Maternal", 0).title,
    "Program 1 of 2 · Prenatal",
  );
  assert.equal(
    headingFor(TB, ["Maternal", "TB"], "Maternal", 1).title,
    "Program 2 of 2 · TB DOTS",
  );
});

test("later steps never show a program title", () => {
  for (const stepKey of [TREATMENT_STEP, NEXT_STEP, REVIEW_STEP]) {
    const heading = headingFor(stepKey, ["Family Planning"], "Family Planning");
    assert.doesNotMatch(heading.title, /Family Planning|Program \d/);
  }
  assert.equal(headingFor(TREATMENT_STEP, ["EPI"], "EPI").title, "BHC Assessment & Actions Taken");
  assert.equal(headingFor(NEXT_STEP, ["EPI"], "EPI").title, "Disposition");
  assert.equal(headingFor(REVIEW_STEP, ["EPI"], "EPI").title, "Review & Confirm");
});

/* ── Validation ownership ────────────────────────────────────────────── */

test("each validation error is owned by the screen that shows its field", () => {
  assert.equal(getErrorOwnerStepKey("chiefComplaint"), INTERVIEW_STEP);
  assert.equal(getErrorOwnerStepKey("summaryOfPresentIllness"), INTERVIEW_STEP);
  // Vital Signs is a card on the first step, so BP belongs to that step.
  assert.equal(getErrorOwnerStepKey("hypertensionDiabeticData.conditionType"), null);
  assert.equal(getErrorOwnerStepKey("tbData.diagnosis.tbCaseNumber"), TB);
  assert.equal(getErrorOwnerStepKey("familyPlanningMethodUsed"), FP);
  assert.equal(getErrorOwnerStepKey("vaccineEntries"), EPI);
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
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, TB)), ["tbData.diagnosis.tbCaseNumber"]);
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, TREATMENT_STEP)), ["dispensedMedicines"]);
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, ASSESSMENT_STEP)), []);
});

test("the earliest failing screen is revealed, in the NEW order", () => {
  const order = getStepOrder(getProgramFormSteps(["Maternal", "TB"], "Maternal"));
  // HPI (Interview) now precedes the TB form, which follows Assessment.
  assert.equal(
    findFirstErrorStepKey(
      { "tbData.phases.intensiveStart": "y", summaryOfPresentIllness: "x" },
      order,
    ),
    INTERVIEW_STEP,
  );
  assert.equal(
    findFirstErrorStepKey({ dispensedMedicines: "x", pulse: "y" }, order),
    INTERVIEW_STEP,
  );
  assert.equal(findFirstErrorStepKey({}, order), "");
});

test("HPI is not demanded before the program decision is made", () => {
  // At Interview no program is chosen yet, so every visit still looks
  // general - requiring HPI there would wrongly bind Maternal/TB visits too.
  const errors = { summaryOfPresentIllness: "Required.", chiefComplaint: "Required." };
  assert.deepEqual(Object.keys(deferUntilProgramDecision(errors, INTERVIEW_STEP)), ["chiefComplaint"]);
});

test("HPI IS enforced once the program decision is made", () => {
  const errors = { summaryOfPresentIllness: "Required." };
  for (const stepKey of [ASSESSMENT_STEP, MATERNAL, TREATMENT_STEP, NEXT_STEP]) {
    assert.deepEqual(deferUntilProgramDecision(errors, stepKey), errors, stepKey);
  }
});

test("deferral never touches unrelated errors, and never mutates its input", () => {
  const errors = { pulse: "Pulse required.", summaryOfPresentIllness: "x" };
  const deferred = deferUntilProgramDecision(errors, INTERVIEW_STEP);
  assert.deepEqual(Object.keys(deferred), ["pulse"]);
  assert.deepEqual(Object.keys(errors), ["pulse", "summaryOfPresentIllness"]);
  assert.deepEqual(deferUntilProgramDecision(undefined, INTERVIEW_STEP), {});
});

/* ── Draft restore: every stage returns to its own screen ────────────── */

/** What the page's draft payload stores for a position (review saves as next). */
function payloadFor(wizardPhase, formStep) {
  return { wizardPhase: wizardPhase === "review" ? "next" : wizardPhase, formStep };
}

for (const [stage, formStep] of [
  ["Interview & Vital Signs", INTERVIEW_STEP],
  ["Physical Examination", ASSESSMENT_STEP],
  ["Program 1 (Maternal)", MATERNAL],
  ["Program 2 (TB)", TB],
  ["BHC Assessment & Actions Taken", TREATMENT_STEP],
]) {
  test(`DRAFT RESTORE: a draft saved on ${stage} reopens on ${stage}`, () => {
    assert.deepEqual(resolveRestoredPosition(payloadFor("form", formStep)), {
      phase: "form",
      formStep,
    });
  });
}

test("DRAFT RESTORE: a draft saved on Next Care reopens on Next Care", () => {
  assert.deepEqual(resolveRestoredPosition(payloadFor("next", TREATMENT_STEP)), {
    phase: "next",
    formStep: TREATMENT_STEP,
  });
});

test("DRAFT RESTORE: a draft saved on Review reopens on Next Care", () => {
  assert.equal(resolveRestoredPosition(payloadFor("review", TREATMENT_STEP)).phase, "next");
});

test("DRAFT RESTORE: the current program index survives the round trip", () => {
  const selected = ["Maternal", "TB"];
  const sequence = getFormSequence(getProgramFormSteps(selected, "Maternal"));
  const restored = resolveRestoredPosition(payloadFor("form", TB));
  assert.equal(resolveFormStep(restored.formStep, sequence), TB);
  assert.equal(sequence.indexOf(TB) - sequence.indexOf(MATERNAL), 1, "still Program 2");
});

test("DRAFT RESTORE: a draft from the old Current Visit screen opens on Interview", () => {
  assert.deepEqual(resolveRestoredPosition({ wizardPhase: "program", formStep: "" }), {
    phase: "form",
    formStep: INTERVIEW_STEP,
  });
  // Even with a stray formStep, the old phase is not trusted.
  assert.equal(
    resolveRestoredPosition({ wizardPhase: "program", formStep: ASSESSMENT_STEP }).formStep,
    INTERVIEW_STEP,
  );
});

test("DRAFT RESTORE: drafts from the previous wizard's form screens still land correctly", () => {
  // Those drafts stored assessment / treatment / a program key; all still exist.
  for (const formStep of [ASSESSMENT_STEP, TREATMENT_STEP, MATERNAL]) {
    assert.equal(resolveRestoredPosition({ wizardPhase: "form", formStep }).formStep, formStep);
  }
});

test("DRAFT RESTORE: a draft from before the steps existed opens on Interview", () => {
  assert.deepEqual(resolveRestoredPosition({}), { phase: "form", formStep: INTERVIEW_STEP });
  assert.deepEqual(resolveRestoredPosition(undefined), { phase: "form", formStep: INTERVIEW_STEP });
});

test("DRAFT RESTORE: a payload never gains a phase the draft allowlist rejects", () => {
  for (const phase of ["program", "form", "next", "review", undefined]) {
    assert.ok(["form", "next", "review"].includes(resolveRestoredPosition({ wizardPhase: phase }).phase));
  }
});

/* ── Interview and Vital Signs are one step ──────────────────────────── */

test("there is no separate Vital Signs screen to click Next through", () => {
  const sequence = getFormSequence(getProgramFormSteps(["Maternal"], "Maternal"));
  assert.equal(sequence.includes("vitals"), false);
  // Next from the first step goes straight to Clinical Assessment.
  assert.equal(getNextStepKey(sequence, INTERVIEW_STEP), ASSESSMENT_STEP);
  // ...and Previous from Assessment comes straight back to it.
  assert.equal(getPreviousStepKey(sequence, ASSESSMENT_STEP), INTERVIEW_STEP);
});

test("vitals errors stop the user on the first step", () => {
  const errors = { pulse: "Pulse required.", chiefComplaint: "Required." };
  assert.deepEqual(
    Object.keys(pickErrorsForStep(deferUntilProgramDecision(errors, INTERVIEW_STEP), INTERVIEW_STEP)).sort(),
    ["chiefComplaint", "pulse"],
  );
});

test("DRAFT RESTORE: a draft saved on the former Vital Signs screen reopens on the first step", () => {
  assert.deepEqual(resolveRestoredPosition({ wizardPhase: "form", formStep: "vitals" }), {
    phase: "form",
    formStep: INTERVIEW_STEP,
  });
  // Even without the mapping, a stale key would still land there.
  assert.equal(resolveFormStep("vitals", getFormSequence([])), INTERVIEW_STEP);
});

test("a draft saved on the removed Hypertension / Diabetic form reopens on a real screen", () => {
  const sequence = getFormSequence(getProgramFormSteps(["Maternal"], "Maternal"));
  const stale = programStepKey("Hypertension / Diabetic Monitoring");
  assert.ok(sequence.includes(resolveFormStep(stale, sequence)));
});
