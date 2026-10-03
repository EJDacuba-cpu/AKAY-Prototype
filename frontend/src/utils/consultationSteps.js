import { PROGRAM_CLASSIFICATIONS } from "./consultationPrograms.js";

/**
 * Step model for the New Consultation workspace.
 *
 *   Patient Interview
 *       -> Physical Exam & Assessment (Vital Signs and Physical Findings, then Assessment and Actions Taken)
 *       -> Care Plan & Next Steps (each condition row also holds its reporting)
 *       -> Monitoring Details (when a monitored condition needs it)
 *       -> Review & Confirm
 *
 * The service forms (Prenatal / Family Planning / EPI) are NOT part of that
 * chain. Patient Interview is the hub: the worker ticks the services in the
 * Barangay Health Services panel, opens each service's form from there, and a
 * finished form returns to where it was opened (the hub, or Review when edited
 * from there). The panel shows each service as Completed / Incomplete.
 *
 * Vital Signs are recorded under Physical Examination on the Physical Exam &
 * Assessment step; Patient Interview holds the Chief Complaint / HPI and the
 * Patient Background. The interview step's key is INTERVIEW_STEP.
 *
 * Two levels:
 *  - GLOBAL steps (one heading each). Health programs are never global steps
 *    of their own: however many are selected they share the single
 *    "Program / Service Details" step.
 *  - The PROGRAM forms nested inside that step, walked one at a time, primary
 *    first, then in the order they were selected.
 *
 * Programs are chosen in the Barangay Health Services panel; their forms still
 * follow the assessment rather than precede it.
 *
 * Pure UI bookkeeping: it never touches the program data itself -
 * selectedPrograms / primaryProgram stay the single source of truth and every
 * form keeps writing the same state it always did.
 */

export const INTERVIEW_STEP = "interview";
export const PROGRAMS_STEP = "programs";
export const ASSESSMENT_STEP = "assessment";
export const NEXT_STEP = "next";
export const REVIEW_STEP = "review";
export const MONITORING_STEP = "monitoring";

const PROGRAM_PREFIX = "program:";

const PROGRAM_STEP_DETAILS = {
  Maternal: {
    label: "Prenatal",
    description:
      "Record the patient's pregnancy and obstetric information for this prenatal consultation.",
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
 * The global steps, one heading each. The service forms are never listed: they
 * are a detour from Patient Interview (see the header), so the steps are
 * the same whichever services are selected.
 */
export function buildConsultationSteps({ monitoringDetailKeys = [] } = {}) {
  return [
    { key: INTERVIEW_STEP, phase: "form", label: "Patient Interview" },
    { key: ASSESSMENT_STEP, phase: "form", label: "Physical Exam & Assessment" },
    { key: NEXT_STEP, phase: "next", label: "Care Plan & Next Steps" },
    // Only when a monitored condition needs data the ITR does not hold (TB today).
    ...(monitoringDetailKeys.length > 0
      ? [{ key: MONITORING_STEP, phase: "next", label: "Monitoring Details" }]
      : []),
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
 * The screens Next / Previous walk through in the form phase. The service forms
 * are deliberately absent: they are opened from the first step and return to
 * where they were opened (see getServiceFormReturnTarget).
 */
export function getFormSequence() {
  return [INTERVIEW_STEP, ASSESSMENT_STEP];
}

/**
 * Where a finished (or abandoned) service form goes back to: Review when it
 * was opened from Review's Edit, otherwise the first step - the hub the
 * services are chosen on. Any other origin (a draft resumed inside a service
 * form, a stray key) also lands on the hub.
 */
export function getServiceFormReturnTarget(origin) {
  return origin === REVIEW_STEP ? REVIEW_STEP : INTERVIEW_STEP;
}

/**
 * Every screen in order, used to rank validation errors. The service forms rank
 * right after the first step, where they are opened from, so a Save that finds
 * a service form incomplete sends the worker there before later screens.
 */
export function getStepOrder(programSteps = [], monitoringDetailKeys = []) {
  return [
    INTERVIEW_STEP,
    ...programSteps.map((step) => step.key),
    ASSESSMENT_STEP,
    NEXT_STEP,
    ...(monitoringDetailKeys.length > 0 ? [MONITORING_STEP] : []),
    REVIEW_STEP,
  ];
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
 * Decision after the last one.
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
// Vital Signs was briefly a screen of its own. A draft saved there still
// reopens on the first step; the fields now live under Physical Examination.
const LEGACY_VITALS_STEP = "vitals";
// Actions Taken was briefly a screen of its own. Its fields now sit under
// Physical Exam & Assessment, so a draft saved there reopens on that step.
const LEGACY_TREATMENT_STEP = "treatment";
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
 *
 * Monitoring Details is saved as the next phase, so it resumes on Care Plan.
 */
export function resolveRestoredPosition(payload = {}) {
  const phase = payload?.wizardPhase;
  const resumesOnNextCare = phase === NEXT_CARE_PHASE;
  const raw = typeof payload?.formStep === "string" ? payload.formStep : "";
  const stored =
    raw === LEGACY_VITALS_STEP ? INTERVIEW_STEP : raw === LEGACY_TREATMENT_STEP ? ASSESSMENT_STEP : raw;
  const usable = phase !== LEGACY_CURRENT_VISIT_PHASE && stored;

  return {
    phase: phase === REVIEW_STEP ? REVIEW_STEP : resumesOnNextCare ? NEXT_CARE_PHASE : FORM_PHASE,
    formStep: usable ? stored : resumesOnNextCare ? ASSESSMENT_STEP : INTERVIEW_STEP,
  };
}

/** The global (progress-bar) step a screen belongs to. */
export function getGlobalStepKey(stepKey) {
  return isProgramStepKey(stepKey) ? PROGRAMS_STEP : stepKey;
}

/** The stored screen if it still exists, otherwise the first form screen. */
export function resolveFormStep(current, formSequence, programSteps = []) {
  if (formSequence.includes(current)) return current;
  if (programSteps.some((step) => step.key === current)) return current;
  return formSequence[0] || "";
}

/**
 * Which screen shows the field behind a validation error. Null means the error
 * is not tied to a specific screen (the caller decides what to do with it).
 */
export function getErrorOwnerStepKey(errorKey) {
  const key = String(errorKey || "");

  if (key === "chiefComplaint" || key === "summaryOfPresentIllness") {
    return INTERVIEW_STEP;
  }
  // Vital Signs are a subsection of Physical Examination.
  if (["pulse", "spo2", "weight", "height", "temp", "fbs"].includes(key) || key === "vital_signs.fbs") {
    return ASSESSMENT_STEP;
  }
  if (key.startsWith("tbData.")) return MONITORING_STEP;
  if (key === "familyPlanningMethodUsed" || key.startsWith("familyPlanningData.")) {
    return programStepKey("Family Planning");
  }
  if (key === "vaccineEntries") return programStepKey("Immunization");
  // The diagnosis list lives on Physical Exam & Assessment.
  if (key === "diagnosis") return ASSESSMENT_STEP;
  // Actions Taken (and the medicines dispensed) sit on the Assessment screen.
  if (key === "dispensedMedicines") return ASSESSMENT_STEP;
  if (key.startsWith("carePlanStop.")) return NEXT_STEP;
  if (key === "reasonForReferral" || key === "receivingRhuId" || key === "urgencyLevel" || key === "followUpDate" || key === "followUpTime" || key === "followUpReason" || key === "followUpStatus") {
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
