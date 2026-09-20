import { PROGRAM_CLASSIFICATIONS } from "./consultationPrograms.js";

/**
 * Step model for the New Consultation workspace.
 *
 * Two levels:
 *  - GLOBAL steps, shown in the progress bar: Current Visit, Program Forms,
 *    Assessment, Treatment, Next Step, Review. Health programs are never
 *    global steps of their own.
 *  - The PROGRAM forms nested inside the single "Program Forms" step, walked
 *    one at a time, primary first.
 *
 * Pure UI bookkeeping: it never touches the program data itself -
 * selectedPrograms / primaryProgram stay the single source of truth and every
 * form keeps writing the same state it always did.
 */

export const VISIT_STEP = "visit";
export const PROGRAMS_STEP = "programs";
export const ASSESSMENT_STEP = "assessment";
export const TREATMENT_STEP = "treatment";
export const NEXT_STEP = "next";
export const REVIEW_STEP = "review";

const PROGRAM_PREFIX = "program:";

const PROGRAM_STEP_DETAILS = {
  Maternal: {
    label: "Maternal / Prenatal Care",
    description: "Complete the maternal / prenatal information for this visit.",
  },
  "TB DOTS / TB Monitoring": {
    label: "TB DOTS",
    description: "Complete the TB-related information for this visit.",
  },
  "Family Planning": {
    label: "Family Planning",
    description: "Complete the family planning information for this visit.",
  },
  "Hypertension / Diabetic Monitoring": {
    label: "Hypertension / Diabetic",
    description:
      "Complete the hypertension / diabetic monitoring details for this visit.",
  },
  Immunization: {
    label: "Child Health / EPI",
    description: "Complete the immunization information for this visit.",
  },
};

export function programStepKey(classification) {
  return `${PROGRAM_PREFIX}${classification}`;
}

export function isProgramStepKey(key) {
  return typeof key === "string" && key.startsWith(PROGRAM_PREFIX);
}

/**
 * One form per distinct classification, primary first, then the rest in the
 * order they were selected. Hypertension and Diabetes are two programs but one
 * form, so picking both yields a single form.
 */
export function getProgramFormSteps(selectedPrograms = [], primaryProgram = "") {
  const selected = Array.isArray(selectedPrograms) ? selectedPrograms : [];
  const ordered = selected.includes(primaryProgram)
    ? [primaryProgram, ...selected.filter((key) => key !== primaryProgram)]
    : [...selected];

  const steps = [];
  for (const program of ordered) {
    const classification = PROGRAM_CLASSIFICATIONS[program];
    if (!classification) continue;

    const existing = steps.find((step) => step.classification === classification);
    if (existing) {
      existing.programs.push(program);
      continue;
    }

    const details = PROGRAM_STEP_DETAILS[classification] || {
      label: classification,
      description: "Complete the program information for this visit.",
    };

    steps.push({
      key: programStepKey(classification),
      classification,
      programs: [program],
      isPrimary: steps.length === 0,
      label: details.label,
      headerDescription: details.description,
    });
  }

  return steps.map((step, index) => ({
    ...step,
    role: step.isPrimary ? "Primary Program" : "Additional Program",
    programNumber: index + 1,
    programCount: steps.length,
  }));
}

/**
 * The global steps for the progress bar. "Program Forms" appears only when at
 * least one health program is selected, so a General Consultation never shows
 * an empty program step.
 */
export function buildConsultationSteps({ selectedPrograms, primaryProgram } = {}) {
  const programSteps = getProgramFormSteps(selectedPrograms, primaryProgram);

  return [
    { key: VISIT_STEP, phase: "program", label: "Current Visit" },
    ...(programSteps.length > 0
      ? [{ key: PROGRAMS_STEP, phase: "form", label: "Program Forms" }]
      : []),
    { key: ASSESSMENT_STEP, phase: "form", label: "Clinical Assessment" },
    { key: TREATMENT_STEP, phase: "form", label: "Treatment / Management" },
    { key: NEXT_STEP, phase: "next", label: "Next Step" },
    { key: REVIEW_STEP, phase: "review", label: "Review" },
  ];
}

/**
 * The screens the form phase walks through: each selected program in turn,
 * then Assessment, then Treatment.
 */
export function getFormSequence(programSteps = []) {
  return [...programSteps.map((step) => step.key), ASSESSMENT_STEP, TREATMENT_STEP];
}

/** Every screen in order, used to rank validation errors and Previous/Continue. */
export function getStepOrder(programSteps = []) {
  return [VISIT_STEP, ...getFormSequence(programSteps), NEXT_STEP, REVIEW_STEP];
}

/** The global (progress-bar) step a screen belongs to. */
export function getGlobalStepKey(stepKey) {
  return isProgramStepKey(stepKey) ? PROGRAMS_STEP : stepKey;
}

/** The stored screen if it still exists, otherwise the first form screen. */
export function resolveFormStep(current, formSequence) {
  return formSequence.includes(current) ? current : formSequence[0] || "";
}

/**
 * Which screen shows the field behind a validation error. Null means the error
 * is not tied to a specific screen (the caller decides what to do with it).
 */
export function getErrorOwnerStepKey(errorKey) {
  const key = String(errorKey || "");

  if (
    key === "chiefComplaint" ||
    key === "summaryOfPresentIllness" ||
    key === "hypertensionDiabeticData.bp"
  ) {
    return VISIT_STEP;
  }
  if (key.startsWith("hypertensionDiabeticData.")) {
    return programStepKey("Hypertension / Diabetic Monitoring");
  }
  if (key.startsWith("tbData.")) return programStepKey("TB DOTS / TB Monitoring");
  if (key === "familyPlanningMethodUsed" || key.startsWith("familyPlanningData.")) {
    return programStepKey("Family Planning");
  }
  if (key === "vaccineEntries") return programStepKey("Immunization");
  if (key === "dispensedMedicines") return TREATMENT_STEP;
  if (key === "followUpDate" || key === "followUpTime" || key === "followUpStatus") {
    return NEXT_STEP;
  }
  return null;
}

/** The subset of errors whose field lives on the given screen. */
export function pickErrorsForStep(errors, stepKey) {
  return Object.fromEntries(
    Object.entries(errors || {}).filter(
      ([key]) => getErrorOwnerStepKey(key) === stepKey,
    ),
  );
}

/** The earliest screen in workflow order that owns any of the errors. */
export function findFirstErrorStepKey(errors, stepOrder) {
  const owners = new Set(
    Object.keys(errors || {}).map(getErrorOwnerStepKey).filter(Boolean),
  );
  return stepOrder.find((key) => owners.has(key)) || "";
}
