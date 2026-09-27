import { PROGRAM_CLASSIFICATIONS } from "./consultationPrograms.js";

/**
 * Step model for the New Consultation workspace.
 *
 *   Interview & Vital Signs -> Clinical Assessment
 *       -> Program / Service Details (only when a program is selected)
 *       -> Treatment & Management -> Next Care Decision -> Review & Save
 *
 * Interview and Vital Signs are one step: two cards on the same screen,
 * with no Next between them. The step's key is INTERVIEW_STEP.
 *
 * Two levels:
 *  - GLOBAL steps (one heading each). Health programs are never global steps
 *    of their own: however many are selected they share the single
 *    "Program / Service Details" step.
 *  - The PROGRAM forms nested inside that step, walked one at a time, primary
 *    first, then in the order they were selected.
 *
 * Programs are chosen at the END of Clinical Assessment, so their forms follow
 * the assessment rather than precede it.
 *
 * Pure UI bookkeeping: it never touches the program data itself -
 * selectedPrograms / primaryProgram stay the single source of truth and every
 * form keeps writing the same state it always did.
 */

export const INTERVIEW_STEP = "interview";
export const PROGRAMS_STEP = "programs";
export const ASSESSMENT_STEP = "assessment";
export const TREATMENT_STEP = "treatment";
export const NEXT_STEP = "next";
export const REVIEW_STEP = "review";

const PROGRAM_PREFIX = "program:";

const PROGRAM_STEP_DETAILS = {
  Maternal: {
    label: "Prenatal",
    description:
      "Record the patient's pregnancy and obstetric information for this prenatal consultation.",
  },
  "TB DOTS / TB Monitoring": {
    label: "TB DOTS",
    description: "Complete the TB-related information for this visit.",
  },
  "Family Planning": {
    label: "Family Planning",
    description: "Complete the family planning information for this visit.",
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
 * order they were selected. Programs that share a classification share one form.
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
 * The global steps, one heading each. "Program / Service Details" appears only
 * when at least one program is selected, so a General Consultation goes
 * straight from Clinical Assessment to Treatment & Management.
 */
export function buildConsultationSteps({ selectedPrograms, primaryProgram, generalSelected = true } = {}) {
  const programSteps = getProgramFormSteps(selectedPrograms, primaryProgram);

  return [
    { key: INTERVIEW_STEP, phase: "form", label: "Concern & Vital Signs" },
    ...(generalSelected ? [{ key: ASSESSMENT_STEP, phase: "form", label: "Physical Examination" }] : []),
    ...(programSteps.length > 0
      ? [{ key: PROGRAMS_STEP, phase: "form", label: "Program / Service Details" }]
      : []),
    { key: TREATMENT_STEP, phase: "form", label: "BHC Assessment & Actions Taken" },
    { key: NEXT_STEP, phase: "next", label: "Disposition" },
    { key: REVIEW_STEP, phase: "review", label: "Review & Confirm" },
  ];
}

/**
 * Title and subtitle for the screen on show.
 *
 * A program-specific heading belongs to the Program / Service Details step and
 * nowhere else. The caller's `activeProgramStep` can point at a program form
 * while another screen is showing, so gating on the global step key is what
 * keeps every other screen's heading generic whatever is selected.
 *
 * With more than one program the title also says where in the set it is:
 * "Program 1 of 2 · Maternal / Prenatal Care".
 */
export function resolveStepHeading({
  currentGlobalStepKey,
  activeProgramStep = null,
  steps = [],
  subtitles = {},
} = {}) {
  if (currentGlobalStepKey === PROGRAMS_STEP && activeProgramStep) {
    const label = activeProgramStep.label || "";
    const count = Number(activeProgramStep.programCount) || 0;
    return {
      title:
        count > 1
          ? `Program ${activeProgramStep.programNumber} of ${count} · ${label}`
          : label,
      subtitle: activeProgramStep.headerDescription || "",
    };
  }

  const step = steps.find((entry) => entry.key === currentGlobalStepKey);
  return {
    title: step?.label || "",
    subtitle: subtitles[currentGlobalStepKey] || "",
  };
}

/**
 * The screens the form phase walks through, in order. Program forms sit AFTER
 * Clinical Assessment (where they are chosen) and are skipped entirely when
 * none is selected.
 */
export function getFormSequence(programSteps = [], generalSelected = true) {
  return [
    INTERVIEW_STEP,
    ...(generalSelected ? [ASSESSMENT_STEP] : []),
    ...programSteps.map((step) => step.key),
    TREATMENT_STEP,
  ];
}

/** Every screen in order, used to rank validation errors and Previous/Continue. */
export function getStepOrder(programSteps = [], generalSelected = true) {
  return [...getFormSequence(programSteps, generalSelected), NEXT_STEP, REVIEW_STEP];
}

/**
 * Errors whose REQUIREMENT depends on the program decision, which is made at
 * the end of Clinical Assessment. History of Present Illness is required for a
 * general consultation only - but Interview comes before the programs are
 * chosen, so at that point every visit still looks general.
 */
const PROGRAM_DECISION_ERRORS = new Set(["summaryOfPresentIllness"]);

/** Steps that come before the program decision is made. */
const BEFORE_PROGRAM_DECISION = new Set([INTERVIEW_STEP]);

/**
 * The errors a step may act on. Before the program decision, any requirement
 * that depends on it is not yet knowable, so it is set aside rather than
 * enforced early; it is enforced when Clinical Assessment is left, and the
 * step gate then sends the user back to the screen that owns the field. The
 * rule itself is unchanged - only WHEN it can be decided moved.
 */
export function deferUntilProgramDecision(errors, stepKey) {
  if (!BEFORE_PROGRAM_DECISION.has(stepKey)) return { ...(errors || {}) };
  return Object.fromEntries(
    Object.entries(errors || {}).filter(([key]) => !PROGRAM_DECISION_ERRORS.has(key)),
  );
}

/** Navigation boundary before the first consultation screen. */
export const EXIT_STEP = "exit";

/**
 * Where Next goes from a form screen: the next screen in order, and Next Care
 * Decision after the last one (Treatment & Management).
 */
export function getNextStepKey(formSequence, current) {
  const index = formSequence.indexOf(current);
  return index >= 0 && index < formSequence.length - 1
    ? formSequence[index + 1]
    : NEXT_STEP;
}

/**
 * Where Previous goes from a form screen: the exact reverse of Next. The first
 * screen (Interview) exits the workspace to its patient context.
 */
export function getPreviousStepKey(formSequence, current) {
  const index = formSequence.indexOf(current);
  return index > 0 ? formSequence[index - 1] : EXIT_STEP;
}

// The wizardPhase values a draft payload can carry. The server allowlist
// accepts exactly program / form / next; nothing new is ever written.
const LEGACY_CURRENT_VISIT_PHASE = "program";
// Vital Signs was briefly a screen of its own. Its fields now sit on the
// first step, so a draft saved there reopens on that step.
const LEGACY_VITALS_STEP = "vitals";
const FORM_PHASE = "form";
const NEXT_CARE_PHASE = "next";

/**
 * The screen a saved draft reopens on - server resume and on-device recovery
 * alike.
 *
 *  - A form screen reopens from its stored formStep.
 *  - Next Care Decision reopens on Next Care (Review is saved as Next Care).
 *  - A draft from the previous wizard's Current Visit, or from before the steps
 *    existed, has no usable formStep and opens on Interview.
 *
 * A stored program form that is no longer selected is resolved to Interview by
 * resolveFormStep at render time.
 */
export function resolveRestoredPosition(payload = {}) {
  const phase = payload?.wizardPhase;
  const resumesOnNextCare = phase === NEXT_CARE_PHASE;
  const raw = typeof payload?.formStep === "string" ? payload.formStep : "";
  const stored = raw === LEGACY_VITALS_STEP ? INTERVIEW_STEP : raw;
  const usable = phase !== LEGACY_CURRENT_VISIT_PHASE && stored;

  return {
    phase: phase === REVIEW_STEP ? REVIEW_STEP : resumesOnNextCare ? NEXT_CARE_PHASE : FORM_PHASE,
    formStep: usable ? stored : resumesOnNextCare ? TREATMENT_STEP : INTERVIEW_STEP,
  };
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

  // Interview and Vital Signs share the first step.
  if (
    ["pulse", "spo2", "weight", "height", "temp"].includes(key) ||
    key === "chiefComplaint" ||
    key === "summaryOfPresentIllness"
  ) {
    return INTERVIEW_STEP;
  }
  if (key.startsWith("tbData.")) return programStepKey("TB DOTS / TB Monitoring");
  if (key === "familyPlanningMethodUsed" || key.startsWith("familyPlanningData.")) {
    return programStepKey("Family Planning");
  }
  if (key === "vaccineEntries") return programStepKey("Immunization");
  if (key === "diagnosis" || key === "dispensedMedicines") return TREATMENT_STEP;
  if (key === "reasonForReferral" || key === "followUpDate" || key === "followUpTime" || key === "followUpStatus") {
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
