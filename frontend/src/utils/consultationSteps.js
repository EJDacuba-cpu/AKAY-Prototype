import { PROGRAM_CLASSIFICATIONS } from "./consultationPrograms.js";

/**
 * Step model for the New Consultation workspace.
 *
 *   Patient Interview
 *       -> Patient History (ITR sections I-V; reviewed or updated per section)
 *       -> Physical Examination (Vital Signs, Physical Findings and the body map)
 *       -> Service Details: one screen per selected service (Prenatal / Family
 *          Planning / EPI), only when a service is selected
 *       -> Clinical Conditions & Reporting (condition modal and three-column grid)
 *       -> Care and Outcome (condition referrals, shared BHC return, treatment)
 *       -> Monitoring Details (when a monitored condition needs it)
 *       -> Review & Finalize
 *
 * The services are ticked in the Barangay Health Services panel on Patient
 * Interview; their forms follow Physical Examination, so the visit's vital
 * signs (height included) are known when a service form opens.
 *
 * Vital Signs are recorded on the Physical Examination step; Patient Interview holds the Chief Complaint / HPI; the
 * patient background lives on its own Patient History step (HISTORY_STEP).
 * The interview step's key is INTERVIEW_STEP.
 *
 * Patient History is opt-out: every helper takes `{ includeHistory }`
 * (default true, so RHU and other callers keep it). The BHC workspace passes
 * BHC_STEP_OPTIONS: no History step, the visit questions (Informant, Similar
 * Illness) sit on Patient Interview, and the background is edited in Patient
 * Background - see docs/superpowers/specs/2026-10-16-bhc-patient-background-design.md.
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
export const HISTORY_STEP = "history";
export const PROGRAMS_STEP = "programs";
export const ASSESSMENT_STEP = "assessment";
export const NEXT_STEP = "next";
export const OUTCOME_STEP = "outcome";
export const REVIEW_STEP = "review";
export const MONITORING_STEP = "monitoring";
export const TB_INTAKE_STEP = "tb-intake";
export const PRESCRIPTION_STEP = "prescription";

const PROGRAM_PREFIX = "program:";

/** The BHC consultation: no Patient History step. */
export const BHC_STEP_OPTIONS = Object.freeze({ includeHistory: false });

/** RHU ITR consultation: History I–V, diagnosis, prescription, walk-in outcome. */
export const RHU_ITR_STEP_OPTIONS = Object.freeze({
  includeHistory: true,
  workflow: "rhu_itr_v1",
});

function isRhuItr(options = {}) {
  return options.workflow === "rhu_itr_v1";
}

function tbIntakeKeys(options = {}) {
  return isRhuItr(options) && options.includeTb ? [TB_INTAKE_STEP] : [];
}

function historySteps(includeHistory) {
  return includeHistory === false ? [] : [HISTORY_STEP];
}

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
 * The global steps, one heading each. However many services are selected they
 * share the one Service Details step, which is listed only when there is at
 * least one.
 */
export function buildConsultationSteps({
  programSteps = [],
  monitoringDetailKeys = [],
  includeHistory = true,
  workflow = null,
  includeTb = false,
} = {}) {
  const rhuItr = workflow === "rhu_itr_v1";
  return [
    { key: INTERVIEW_STEP, phase: "form", label: "Patient Interview" },
    ...historySteps(includeHistory).map((key) => ({ key, phase: "form", label: "Patient History" })),
    { key: ASSESSMENT_STEP, phase: "form", label: "Physical Examination" },
    ...(programSteps.length > 0
      ? [{ key: PROGRAMS_STEP, phase: "form", label: "Service Details" }]
      : []),
    ...(rhuItr && includeTb
      ? [{ key: TB_INTAKE_STEP, phase: "form", label: "TB Intake" }]
      : []),
    { key: NEXT_STEP, phase: "next", label: rhuItr ? "Diagnosis" : "Clinical Conditions & Reporting" },
    ...(rhuItr ? [{ key: PRESCRIPTION_STEP, phase: "next", label: "Prescription" }] : []),
    { key: OUTCOME_STEP, phase: "next", label: "Care and Outcome" },
    // Only when a monitored condition needs data the ITR does not hold (TB today).
    ...(!rhuItr && monitoringDetailKeys.length > 0
      ? [{ key: MONITORING_STEP, phase: "next", label: "Monitoring Details" }]
      : []),
    { key: REVIEW_STEP, phase: "review", label: "Review & Finalize" },
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
 * The screens Next / Previous walk through in the form phase: Interview,
 * Physical Examination, then each selected service's form in program order.
 */
export function getFormSequence(programSteps = [], options = {}) {
  const { includeHistory = true } = options;
  return [
    INTERVIEW_STEP,
    ...historySteps(includeHistory),
    ASSESSMENT_STEP,
    ...programSteps.map((step) => step.key),
    ...tbIntakeKeys(options),
  ];
}

/** Every screen in order, used to rank validation errors. */
export function getStepOrder(programSteps = [], monitoringDetailKeys = [], options = {}) {
  const { includeHistory = true } = options;
  const rhuItr = isRhuItr(options);
  return [
    INTERVIEW_STEP,
    ...historySteps(includeHistory),
    ASSESSMENT_STEP,
    ...programSteps.map((step) => step.key),
    ...tbIntakeKeys(options),
    NEXT_STEP,
    ...(rhuItr ? [PRESCRIPTION_STEP] : []),
    OUTCOME_STEP,
    ...(!rhuItr && monitoringDetailKeys.length > 0 ? [MONITORING_STEP] : []),
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
const BEFORE_PROGRAM_DECISION = new Set([INTERVIEW_STEP, HISTORY_STEP]);

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
// Actions Taken was briefly a screen of its own. A draft saved there still
// reopens on Physical Examination (the fields now sit on step 3).
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
 * Monitoring Details is saved as the next phase, so it resumes on
 * Medication, Treatment & Next Steps.
 *
 * Without the History step (BHC), a draft saved on Patient History reopens on
 * Patient Interview, where its visit questions now live.
 */
export function resolveRestoredPosition(payload = {}, { includeHistory = true } = {}) {
  const phase = payload?.wizardPhase;
  const resumesOnNextCare = phase === NEXT_CARE_PHASE;
  const raw = typeof payload?.formStep === "string" ? payload.formStep : "";
  const stored =
    raw === LEGACY_VITALS_STEP || (raw === HISTORY_STEP && includeHistory === false)
      ? INTERVIEW_STEP
      : raw === LEGACY_TREATMENT_STEP
        ? ASSESSMENT_STEP
        : raw;
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
const RHU_TB_FINALIZE_PREFIXES = [
  "tbData.diagnosis",
  "tbData.classification",
  "tbData.regimen",
  "tbData.phases",
  "tbData.outcome",
  "tbData.comorbidities.art",
  "tbData.comorbidities.cpt",
  "tbData.comorbidities.otherComorbidities",
];

function isRhuTbFinalizeError(key) {
  return RHU_TB_FINALIZE_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix));
}

export function getErrorOwnerStepKey(errorKey, options = {}) {
  const { includeHistory = true, workflow } = options;
  const key = String(errorKey || "");

  if (key === "chiefComplaint" || key === "summaryOfPresentIllness") {
    return INTERVIEW_STEP;
  }
  // Patient History: the staged background update and the per-visit informant.
  // Without that step (BHC) they are shown on Patient Interview: the visit
  // questions and an old draft's staged background recovery both live there.
  if (key.startsWith("background_update") || key.startsWith("informant") || key.startsWith("similar_illness")) {
    return includeHistory === false ? INTERVIEW_STEP : HISTORY_STEP;
  }
  // Vital Signs are a subsection of Physical Examination.
  if (["pulse", "spo2", "weight", "height", "temp", "fbs"].includes(key) || key === "vital_signs.fbs") {
    return ASSESSMENT_STEP;
  }
  if (key.startsWith("tbData.")) {
    if (workflow === "rhu_itr_v1") {
      return isRhuTbFinalizeError(key) ? NEXT_STEP : TB_INTAKE_STEP;
    }
    return MONITORING_STEP;
  }
  if (key === "familyPlanningMethodUsed" || key.startsWith("familyPlanningData.")) {
    return programStepKey("Family Planning");
  }
  if (
    key.startsWith("maternalData.") ||
    key.startsWith("maternal_data.") ||
    key === "expectedDeliveryDate" ||
    key === "aog" ||
    key === "prenatalIntent" ||
    key === "monitoring_data.prenatalIntent"
  ) {
    return programStepKey("Maternal");
  }
  if (key === "vaccineEntries") return programStepKey("Immunization");
  // The Reporting entries (and any server error on diagnoses) live on step 3.
  if (key.startsWith("reportingEntry.") && key.includes(".referral.")) return OUTCOME_STEP;
  if (key.startsWith("diagnoses.") && key.includes(".referral.")) return OUTCOME_STEP;
  if (key === "diagnosis" || key === "diagnoses" || key.startsWith("diagnoses.") || key.startsWith("reportingEntry.")) return NEXT_STEP;
  // Actions Taken (and the medicines dispensed) sit on step 3 too.
  if (key === "dispensedMedicines") return OUTCOME_STEP;
  if (key === "prescribedMedicines" || key.startsWith("prescribedMedicines.")) return PRESCRIPTION_STEP;
  if (key.startsWith("carePlanStop.") || key.startsWith("carePlanAction.")) return OUTCOME_STEP;
  if (key === "followUpAcknowledged" || key === "referralAcknowledged") return OUTCOME_STEP;
  // Server-only v2 next-action keys.
  if (key === "care_plan.refer_to_rhu" || key === "needs_referral") return OUTCOME_STEP;
  if (key === "reasonForReferral" || key === "receivingRhuId" || key === "urgencyLevel" || key === "followUpDate" || key === "followUpTime" || key === "followUpReason" || key === "followUpStatus") {
    return OUTCOME_STEP;
  }
  return null;
}

// Server-only 422 keys, renamed to the field keys step 3 reads.
const SERVER_ERROR_KEYS = {
  referral: "reasonForReferral",
  "monitoring_data.followUpReason": "followUpReason",
  "monitoring_data.followUpDate": "followUpDate",
  "monitoring_data.followUpTime": "followUpTime",
  "monitoring_data.prenatalIntent": "prenatalIntent",
  "maternal_data.lmp": "maternalData.lmp",
  "referral.reason_for_referral": "reasonForReferral",
  "referral.rural_health_unit_id": "receivingRhuId",
  "referral.urgency_level": "urgencyLevel",
  "care_plan.shared_referral_acknowledged": "referralAcknowledged",
};

/** Renames server validation keys to the form's field keys; other keys pass through. */
export function remapServerErrorKeys(errors, entries = []) {
  return Object.fromEntries(
    Object.entries(errors || {}).map(([key, message]) => {
      const match = /^diagnoses\.(\d+)\.(.+)$/.exec(key);
      const entryId = match && entries[Number(match[1])]?.id;
      return [entryId ? `reportingEntry.${entryId}.${match[2]}` : SERVER_ERROR_KEYS[key] || key, message];
    }),
  );
}

/** The subset of errors whose field lives on the given screen. */
export function pickErrorsForStep(errors, stepKey, options) {
  return Object.fromEntries(
    Object.entries(errors || {}).filter(
      ([key]) => getErrorOwnerStepKey(key, options) === stepKey,
    ),
  );
}

/** The earliest screen in workflow order that owns any of the errors. */
export function findFirstErrorStepKey(errors, stepOrder, options) {
  const owners = new Set(
    Object.keys(errors || {}).map((key) => getErrorOwnerStepKey(key, options)).filter(Boolean),
  );
  return stepOrder.find((key) => owners.has(key)) || "";
}
