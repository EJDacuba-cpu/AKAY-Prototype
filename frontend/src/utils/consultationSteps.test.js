import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSESSMENT_STEP,
  INTERVIEW_STEP,
  MONITORING_STEP,
  NEXT_STEP,
  OUTCOME_STEP,
  PROGRAMS_STEP,
  REVIEW_STEP,
  EXIT_STEP,
  buildConsultationSteps,
  deferUntilProgramDecision,
  findFirstErrorStepKey,
  remapServerErrorKeys,
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
const FP = programStepKey("Family Planning");
const EPI = programStepKey("Immunization");

/** Every screen from Interview to Review, following Next the way the page does. */
function walkForward(programs = [], primary = "") {
  const sequence = getFormSequence(getProgramFormSteps(programs, primary));
  const screens = [sequence[0]];
  let current = sequence[0];
  while (current !== NEXT_STEP) {
    current = getNextStepKey(sequence, current);
    screens.push(current);
  }
  return [...screens, REVIEW_STEP];
}

/* ── The flows ───────────────────────────────────────────────────────── */

test("GENERAL CONSULTATION: Interview → Physical Examination → Medication, Treatment & Next Steps → Review", () => {
  assert.deepEqual(walkForward([], ""), [
    INTERVIEW_STEP,
    ASSESSMENT_STEP,
    NEXT_STEP,
    REVIEW_STEP,
  ]);
});

test("SERVICES come after Physical Examination, primary first", () => {
  assert.deepEqual(walkForward(["Maternal"], "Maternal"), [
    INTERVIEW_STEP, ASSESSMENT_STEP, MATERNAL, NEXT_STEP, REVIEW_STEP,
  ]);
  assert.deepEqual(walkForward(["EPI", "Maternal"], "Maternal"), [
    INTERVIEW_STEP, ASSESSMENT_STEP, MATERNAL, EPI, NEXT_STEP, REVIEW_STEP,
  ]);
  assert.deepEqual(walkForward(["EPI", "Maternal"], "EPI"), [
    INTERVIEW_STEP, ASSESSMENT_STEP, EPI, MATERNAL, NEXT_STEP, REVIEW_STEP,
  ]);
});

test("Service Details is a global step only when a service is selected", () => {
  const none = buildConsultationSteps({ programSteps: [] });
  assert.equal(keysOf(none).includes(PROGRAMS_STEP), false);
  for (const programs of [["EPI"], ["Maternal", "EPI"]]) {
    const steps = buildConsultationSteps({ programSteps: getProgramFormSteps(programs, programs[0]) });
    const keys = keysOf(steps);
    const index = keys.indexOf(PROGRAMS_STEP);
    assert.ok(index > 0, programs.join());
    assert.equal(keys[index - 1], ASSESSMENT_STEP);
    assert.equal(keys[index + 1], NEXT_STEP);
    const step = steps[index];
    assert.equal(step.label, "Service Details");
    assert.equal(step.phase, "form");
  }
});

test("BACKWARD: Previous reverses the exact forward order, out to patient context", () => {
  const sequence = getFormSequence(getProgramFormSteps(["Maternal", "EPI"], "Maternal"));
  const back = [];
  let current = EPI;
  while (current !== EXIT_STEP) {
    back.push(current);
    current = getPreviousStepKey(sequence, current);
  }
  assert.deepEqual(back, [EPI, MATERNAL, ASSESSMENT_STEP, INTERVIEW_STEP]);
  // Previous from Medication, Treatment & Next Steps lands on the last form screen.
  assert.equal(sequence[sequence.length - 1], EPI);
  assert.equal(getPreviousStepKey(getFormSequence([]), ASSESSMENT_STEP), INTERVIEW_STEP);
});

test("Previous from Interview exits to patient context", () => {
  assert.equal(getPreviousStepKey(getFormSequence([]), INTERVIEW_STEP), EXIT_STEP);
});

test("Next from Physical Examination (no programs) goes to Medication, Treatment & Next Steps", () => {
  assert.equal(getNextStepKey(getFormSequence([]), ASSESSMENT_STEP), NEXT_STEP);
});

test("with services, Next from Physical Examination opens the first form and the last form leads on", () => {
  const sequence = getFormSequence(getProgramFormSteps(["Maternal", "EPI"], "Maternal"));
  assert.equal(getNextStepKey(sequence, ASSESSMENT_STEP), MATERNAL);
  assert.equal(getNextStepKey(sequence, EPI), NEXT_STEP);
});

/* ── Global steps ────────────────────────────────────────────────────── */

test("the global steps read in the new order with the new names", () => {
  const steps = buildConsultationSteps({
    programSteps: getProgramFormSteps(["Maternal", "EPI", "Family Planning"], "Maternal"),
  });
  assert.deepEqual(
    steps.map((step) => step.label),
    [
      "Patient Interview",
      "Physical Examination",
      "Service Details",
      "Clinical Conditions & Reporting",
      "Care and Outcome",
      "Review & Finalize",
    ],
  );
});

test("one service or three give the same global steps; none lacks only Service Details", () => {
  const three = buildConsultationSteps({ programSteps: getProgramFormSteps(["Maternal", "EPI", "Family Planning"], "Maternal") });
  const one = buildConsultationSteps({ programSteps: getProgramFormSteps(["EPI"], "EPI") });
  const none = buildConsultationSteps({ programSteps: [] });
  assert.deepEqual(keysOf(three), keysOf(one));
  assert.deepEqual(keysOf(none), keysOf(one).filter((key) => key !== PROGRAMS_STEP));
});

test("every form screen belongs to the form phase", () => {
  const steps = buildConsultationSteps({ selectedPrograms: ["EPI"], primaryProgram: "EPI" });
  for (const key of [INTERVIEW_STEP, ASSESSMENT_STEP]) {
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

test("step order spans Interview through Review, the service forms right after Physical Examination", () => {
  assert.deepEqual(getStepOrder(getProgramFormSteps(["Maternal", "EPI"], "Maternal")), [
    INTERVIEW_STEP,
    ASSESSMENT_STEP,
    MATERNAL,
    EPI,
    NEXT_STEP,
    OUTCOME_STEP,
    REVIEW_STEP,
  ]);
});

/* ── Program ordering (unchanged behaviour) ──────────────────────────── */

test("the nested program list puts the primary first, then selected order", () => {
  const forms = getProgramFormSteps(["EPI", "Maternal", "Family Planning"], "Maternal");
  assert.deepEqual(forms.map((step) => step.classification), [
    "Maternal",
    "Immunization",
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
  const forms = getProgramFormSteps(["EPI", "Maternal"], "Family Planning");
  assert.equal(forms[0].classification, "Immunization");
  assert.equal(forms[0].isPrimary, true);
});

test("unknown program keys never produce a form", () => {
  assert.deepEqual(getProgramFormSteps(["Nonsense"], "Nonsense"), []);
});

test("a stored screen that no longer exists falls back to Interview", () => {
  const programs = getProgramFormSteps(["Maternal", "EPI"], "Maternal");
  const sequence = getFormSequence(programs);
  assert.equal(resolveFormStep(EPI, sequence, programs), EPI); // a selected service form is a valid screen
  assert.equal(resolveFormStep(EPI, getFormSequence([])), INTERVIEW_STEP); // ...but only when it is selected
  assert.equal(resolveFormStep(FP, sequence, programs), INTERVIEW_STEP); // deselected program
  assert.equal(resolveFormStep("", sequence, programs), INTERVIEW_STEP);
  assert.equal(resolveFormStep("visit", sequence, programs), INTERVIEW_STEP); // old Current Visit key
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
  ["Family Planning", ["Family Planning"], "Family Planning"],
  ["EPI", ["EPI"], "EPI"],
  ["several programs", ["EPI", "Maternal"], "Maternal"],
]) {
  test(`Interview and Assessment keep their own headings with ${label}`, () => {
    // Guard against a vacuous pass: with programs selected there really is a
    // program step the heading could wrongly pick up.
    assert.equal(getProgramFormSteps(programs, primary).length > 0, programs.length > 0);

    assert.deepEqual(headingFor(INTERVIEW_STEP, programs, primary), {
      title: "Patient Interview",
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
    headingFor(MATERNAL, ["Maternal", "EPI"], "Maternal", 0).title,
    "Program 1 of 2 · Prenatal",
  );
  assert.equal(
    headingFor(EPI, ["Maternal", "EPI"], "Maternal", 1).title,
    "Program 2 of 2 · Child Health / EPI",
  );
});

test("later steps never show a program title", () => {
  for (const stepKey of [NEXT_STEP, REVIEW_STEP]) {
    const heading = headingFor(stepKey, ["Family Planning"], "Family Planning");
    assert.doesNotMatch(heading.title, /Family Planning|Program \d/);
  }
  assert.equal(headingFor(NEXT_STEP, ["EPI"], "EPI").title, "Clinical Conditions & Reporting");
  assert.equal(headingFor(OUTCOME_STEP, ["EPI"], "EPI").title, "Care and Outcome");
  assert.equal(headingFor(REVIEW_STEP, ["EPI"], "EPI").title, "Review & Finalize");
});

/* ── Validation ownership ────────────────────────────────────────────── */

test("each validation error is owned by the screen that shows its field", () => {
  assert.equal(getErrorOwnerStepKey("chiefComplaint"), INTERVIEW_STEP);
  assert.equal(getErrorOwnerStepKey("summaryOfPresentIllness"), INTERVIEW_STEP);
  // Vital Signs is a subsection of Physical Examination on the assessment step.
  for (const key of ["pulse", "spo2", "weight", "height", "temp", "fbs", "vital_signs.fbs"]) {
    assert.equal(getErrorOwnerStepKey(key), ASSESSMENT_STEP, key);
  }
  assert.equal(getErrorOwnerStepKey("hypertensionDiabeticData.conditionType"), null);
  assert.equal(getErrorOwnerStepKey("tbData.diagnosis.tbCaseNumber"), MONITORING_STEP);
  // Reporting entries (and any server diagnoses error) live on step 3.
  assert.equal(getErrorOwnerStepKey("diagnosis"), NEXT_STEP);
  assert.equal(getErrorOwnerStepKey("reportingEntry.r1.name"), NEXT_STEP);
  assert.equal(getErrorOwnerStepKey("reportingEntry.r1.reportIn"), NEXT_STEP);
  assert.equal(getErrorOwnerStepKey("diagnoses.0.name"), NEXT_STEP);
  assert.equal(getErrorOwnerStepKey("familyPlanningMethodUsed"), FP);
  assert.equal(getErrorOwnerStepKey("vaccineEntries"), EPI);
  // Actions Taken (and the medicines dispensed) sit on Medication, Treatment & Next Steps.
  assert.equal(getErrorOwnerStepKey("dispensedMedicines"), OUTCOME_STEP);
  assert.equal(getErrorOwnerStepKey("followUpDate"), OUTCOME_STEP);
  assert.equal(getErrorOwnerStepKey("followUpReason"), OUTCOME_STEP);
  assert.equal(getErrorOwnerStepKey("receivingRhuId"), OUTCOME_STEP);
  assert.equal(getErrorOwnerStepKey("urgencyLevel"), OUTCOME_STEP);
  // Server-only v2 next-action keys.
  assert.equal(getErrorOwnerStepKey("care_plan.refer_to_rhu"), OUTCOME_STEP);
  assert.equal(getErrorOwnerStepKey("needs_referral"), OUTCOME_STEP);
  assert.equal(getErrorOwnerStepKey("somethingElse"), null);
});

test("per-screen validation only blocks on that screen's own errors", () => {
  const errors = {
    "tbData.diagnosis.tbCaseNumber": "TB case number is required.",
    dispensedMedicines: "Click Add Medicine.",
    familyPlanningMethodUsed: "Method is required.",
  };
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, MONITORING_STEP)), ["tbData.diagnosis.tbCaseNumber"]);
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, OUTCOME_STEP)), ["dispensedMedicines"]);
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, NEXT_STEP)), []);
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, ASSESSMENT_STEP)), []);
});

test("the earliest failing screen is revealed, in the NEW order", () => {
  const order = getStepOrder(getProgramFormSteps(["Maternal", "EPI"], "Maternal"), ["tb_dots"]);
  // HPI (Interview) precedes Monitoring Details, which follows Care Plan.
  assert.equal(
    findFirstErrorStepKey(
      { "tbData.phases.intensiveStart": "y", summaryOfPresentIllness: "x" },
      order,
    ),
    INTERVIEW_STEP,
  );
  assert.equal(
    findFirstErrorStepKey({ dispensedMedicines: "x", pulse: "y" }, order),
    ASSESSMENT_STEP,
  );
  assert.equal(
    findFirstErrorStepKey({ dispensedMedicines: "x", "tbData.phases.intensiveStart": "y" }, order),
    OUTCOME_STEP,
  );
  assert.equal(findFirstErrorStepKey({}, order), "");
});

test("HPI is not demanded before the program decision is made", () => {
  // At Interview no program is chosen yet, so every visit still looks
  // general - requiring HPI there would wrongly bind Maternal/EPI visits too.
  const errors = { summaryOfPresentIllness: "Required.", chiefComplaint: "Required." };
  assert.deepEqual(Object.keys(deferUntilProgramDecision(errors, INTERVIEW_STEP)), ["chiefComplaint"]);
});

test("HPI IS enforced once the program decision is made", () => {
  const errors = { summaryOfPresentIllness: "Required." };
  for (const stepKey of [ASSESSMENT_STEP, MATERNAL, NEXT_STEP]) {
    assert.deepEqual(deferUntilProgramDecision(errors, stepKey), errors, stepKey);
  }
});

test("deferral never touches unrelated errors, and never mutates its input", () => {
  const errors = { chiefComplaint: "Required.", summaryOfPresentIllness: "x" };
  const deferred = deferUntilProgramDecision(errors, INTERVIEW_STEP);
  assert.deepEqual(Object.keys(deferred), ["chiefComplaint"]);
  assert.deepEqual(Object.keys(errors), ["chiefComplaint", "summaryOfPresentIllness"]);
  assert.deepEqual(deferUntilProgramDecision(undefined, INTERVIEW_STEP), {});
});

/* ── Draft restore: every stage returns to its own screen ────────────── */

/** What the page's draft payload stores for a position (review saves as next). */
function payloadFor(wizardPhase, formStep) {
  return { wizardPhase: wizardPhase === "review" ? "next" : wizardPhase, formStep };
}

for (const [stage, formStep] of [
  ["Patient Interview", INTERVIEW_STEP],
  ["Physical Examination", ASSESSMENT_STEP],
  ["Program 1 (Maternal)", MATERNAL],
  ["Program 2 (EPI)", EPI],
]) {
  test(`DRAFT RESTORE: a draft saved on ${stage} reopens on ${stage}`, () => {
    assert.deepEqual(resolveRestoredPosition(payloadFor("form", formStep)), {
      phase: "form",
      formStep,
    });
  });
}

test("DRAFT RESTORE: a draft saved on Next Care reopens on Next Care", () => {
  assert.deepEqual(resolveRestoredPosition(payloadFor("next", ASSESSMENT_STEP)), {
    phase: "next",
    formStep: ASSESSMENT_STEP,
  });
});

test("DRAFT RESTORE: a draft saved on the old Actions Taken screen reopens on Assessment", () => {
  assert.deepEqual(resolveRestoredPosition(payloadFor("form", "treatment")), {
    phase: "form",
    formStep: ASSESSMENT_STEP,
  });
  assert.equal(resolveRestoredPosition(payloadFor("next", "treatment")).formStep, ASSESSMENT_STEP);
});

test("DRAFT RESTORE: a draft saved on Review reopens on Next Care", () => {
  assert.equal(resolveRestoredPosition(payloadFor("review", ASSESSMENT_STEP)).phase, "next");
});

test("DRAFT RESTORE: the current program index survives the round trip", () => {
  const programs = getProgramFormSteps(["Maternal", "EPI"], "Maternal");
  const restored = resolveRestoredPosition(payloadFor("form", EPI));
  assert.equal(resolveFormStep(restored.formStep, getFormSequence(), programs), EPI);
  const indexOf = (key) => programs.findIndex((step) => step.key === key);
  assert.equal(indexOf(EPI) - indexOf(MATERNAL), 1, "still Program 2");
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
  // Those drafts stored assessment / a program key; both still exist.
  for (const formStep of [ASSESSMENT_STEP, MATERNAL]) {
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

/* ── Vital Signs live under Physical Examination ─────────────────────── */

test("there is no separate Vital Signs screen to click Next through", () => {
  const sequence = getFormSequence();
  assert.equal(sequence.includes("vitals"), false);
  // Next from the first step goes straight to Clinical Assessment.
  assert.equal(getNextStepKey(sequence, INTERVIEW_STEP), ASSESSMENT_STEP);
  // ...and Previous from Assessment comes straight back to it.
  assert.equal(getPreviousStepKey(sequence, ASSESSMENT_STEP), INTERVIEW_STEP);
});

test("vitals errors stop the user on the Physical Examination step", () => {
  const errors = { pulse: "Pulse required.", chiefComplaint: "Required." };
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, INTERVIEW_STEP)), ["chiefComplaint"]);
  assert.deepEqual(Object.keys(pickErrorsForStep(errors, ASSESSMENT_STEP)), ["pulse"]);
});

test("DRAFT RESTORE: a draft saved on the former Vital Signs screen reopens on the first step", () => {
  assert.deepEqual(resolveRestoredPosition({ wizardPhase: "form", formStep: "vitals" }), {
    phase: "form",
    formStep: INTERVIEW_STEP,
  });
  // Even without the mapping, a stale key would still land there.
  assert.equal(resolveFormStep("vitals", getFormSequence()), INTERVIEW_STEP);
});

test("a draft saved on the removed Hypertension / Diabetic form reopens on a real screen", () => {
  const sequence = getFormSequence();
  const stale = programStepKey("Hypertension / Diabetic Monitoring");
  assert.ok(sequence.includes(resolveFormStep(stale, sequence, getProgramFormSteps(["Maternal"], "Maternal"))));
});

test("condition and outcome steps, and Monitoring Details appears only when needed", () => {
  const labels = buildConsultationSteps({ selectedPrograms: [], primaryProgram: "" }).map((s) => s.label);
  assert.deepEqual(labels, ["Patient Interview", "Physical Examination", "Clinical Conditions & Reporting", "Care and Outcome", "Review & Finalize"]);

  const withTb = buildConsultationSteps({ selectedPrograms: [], primaryProgram: "", monitoringDetailKeys: ["tb_dots"] }).map((s) => s.key);
  assert.deepEqual(withTb, [INTERVIEW_STEP, ASSESSMENT_STEP, NEXT_STEP, OUTCOME_STEP, MONITORING_STEP, REVIEW_STEP]);
  assert.deepEqual(getStepOrder([], ["tb_dots"]).slice(-3), [OUTCOME_STEP, MONITORING_STEP, REVIEW_STEP]);
});

test("TB and stop-reason errors route to their screens", () => {
  assert.equal(getErrorOwnerStepKey("tbData.diagnosis.tbCaseNumber"), MONITORING_STEP);
  assert.equal(getErrorOwnerStepKey("carePlanStop.3"), OUTCOME_STEP);
});

test("acknowledgment errors route to Medication, Treatment & Next Steps", () => {
  assert.equal(getErrorOwnerStepKey("carePlanAction.d1"), OUTCOME_STEP);
  assert.equal(getErrorOwnerStepKey("followUpAcknowledged"), OUTCOME_STEP);
  assert.equal(getErrorOwnerStepKey("referralAcknowledged"), OUTCOME_STEP);
  // Save reveals Care Plan, the earliest failing screen, from Review.
  const order = getStepOrder([], []);
  assert.equal(findFirstErrorStepKey({ referralAcknowledged: "x" }, order), OUTCOME_STEP);
  assert.equal(findFirstErrorStepKey({ "carePlanAction.d2": "x", followUpAcknowledged: "y" }, order), OUTCOME_STEP);
});

test("server-only 422 keys are renamed to the Care Plan field keys and route to Care Plan", () => {
  const remapped = remapServerErrorKeys({
    "monitoring_data.followUpReason": "a",
    "monitoring_data.followUpDate": "b",
    "care_plan.shared_referral_acknowledged": "c",
    chiefComplaint: "d",
  });
  assert.deepEqual(remapped, { followUpReason: "a", followUpDate: "b", referralAcknowledged: "c", chiefComplaint: "d" });
  assert.equal(findFirstErrorStepKey({ "care_plan.shared_referral_acknowledged": "c" }, getStepOrder([], [])), "");
  assert.equal(findFirstErrorStepKey(remapServerErrorKeys({ "care_plan.shared_referral_acknowledged": "c" }), getStepOrder([], [])), OUTCOME_STEP);
  assert.deepEqual(remapServerErrorKeys(), {});
});
