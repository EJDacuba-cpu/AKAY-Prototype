import { getCareTracking } from "./careTracking.js";
import { getConsultationPrograms } from "./consultationPrograms.js";
import { servicePurposeKey } from "./followUpSchedules.js";
import { continuePrenatalPrefill } from "./prenatalForm.js";

export const PRENATAL_INTENT_ENROLL = "enroll";
export const PRENATAL_INTENT_CONTINUE = "continue";

/**
 * Whether Care & Programs currently shows an open maternal episode.
 * Completed (post-42-day) pregnancies can be enrolled again; Prenatal and
 * Postpartum cannot.
 */
export function isActivePrenatalEnrollment(status) {
  return status === "Prenatal" || status === "Postpartum";
}

/**
 * Enrollment state derived from finalized records. Drafts never enroll.
 */
export function getPrenatalEnrollment(patient = {}, records = [], today = new Date()) {
  const maternal = getCareTracking(patient, records, today).find((entry) => entry.key === "maternal");
  const recordsForProgram = maternal?.records || [];
  const latestRecord = recordsForProgram.length ? recordsForProgram[recordsForProgram.length - 1] : null;
  const status = recordsForProgram.length ? maternal.status : "Not started";
  const enrolled = isActivePrenatalEnrollment(status);

  return {
    enrolled,
    status,
    intent: enrolled ? PRENATAL_INTENT_CONTINUE : PRENATAL_INTENT_ENROLL,
    latestRecord,
    prefill: enrolled && latestRecord ? continuePrenatalPrefill(latestRecord) : null,
    nextVisit: maternal?.nextVisit || "",
    visitCount: recordsForProgram.length,
  };
}

export const MATERNAL_CARE_PROGRAM_TITLE = "Maternal Care";
export const MATERNAL_CARE_MALE_ELIGIBILITY =
  "Maternal Care records are for pregnant clients. This patient is recorded as male.";

export const MATERNAL_SERVICE_LOADING_LABEL = "Loading";
export const MATERNAL_SERVICE_RETRY_LABEL = "Retry";

export function prenatalProgramCopy({
  enrolled,
  included,
  resolving = false,
  loadFailed = false,
  hideAction = false,
} = {}) {
  if (resolving) {
    return {
      title: MATERNAL_CARE_PROGRAM_TITLE,
      enrollLabel: MATERNAL_SERVICE_LOADING_LABEL,
      statusLabel: MATERNAL_SERVICE_LOADING_LABEL,
      statusTone: "neutral",
      description: "Resolving Maternal Care for this visit.",
      hideAction: false,
    };
  }
  if (loadFailed) {
    return {
      title: MATERNAL_CARE_PROGRAM_TITLE,
      enrollLabel: MATERNAL_SERVICE_RETRY_LABEL,
      statusLabel: "Unavailable",
      statusTone: "neutral",
      description: "Maternal Care could not be loaded. Retry before including or removing this service.",
      hideAction: false,
    };
  }
  if (hideAction && enrolled) {
    return {
      title: `${MATERNAL_CARE_PROGRAM_TITLE} — Active`,
      enrollLabel: "",
      statusLabel: "Active",
      statusTone: "active",
      description: included
        ? "Active Maternal Care is included with the selected prenatal follow-up. This visit does not start a second enrollment."
        : "Active Maternal Care from a finalized consultation. A prenatal assessment is added only when continuing a selected prenatal follow-up.",
      hideAction: true,
    };
  }
  return {
    title: MATERNAL_CARE_PROGRAM_TITLE,
    enrollLabel: enrolled ? "Continue Maternal Care" : "Include Maternal Care",
    statusLabel: enrolled
      ? included
        ? "Continuing this visit"
        : "Active"
      : included
        ? "Included this visit"
        : "Not included",
    statusTone: enrolled ? "active" : included ? "included" : "neutral",
    description: enrolled
      ? "Active Maternal Care from a finalized consultation. Continue this visit without starting a second enrollment."
      : "Optional. Maternal Care becomes Active only after this consultation is finalized.",
    hideAction: false,
  };
}

/**
 * A scheduled follow-up is prenatal/Maternal when its purpose key or source
 * record already names Maternal Care. Purpose text is never enough on its own.
 */
export function isPrenatalAssociatedFollowUp(task = {}) {
  if (String(task.purposeKey || "") === servicePurposeKey("Maternal")) return true;
  return getConsultationPrograms({
    selectedPrograms: Array.isArray(task.sourceSelectedPrograms) ? task.sourceSelectedPrograms : undefined,
    category: task.sourceCategory,
  }).includes("Maternal");
}

/**
 * Seed Maternal Care on a new continue-route consultation only: not a restored
 * draft, not an unrelated follow-up, not a second click, and only while the
 * patient already has Active Maternal Care.
 */
export function shouldSeedMaternalFromPrenatalFollowUp({
  followUps = [],
  restored = false,
  alreadyIncluded = false,
  enrolled = false,
} = {}) {
  if (restored || alreadyIncluded || !enrolled) return false;
  return (Array.isArray(followUps) ? followUps : []).some(isPrenatalAssociatedFollowUp);
}

/**
 * Pregnancy identity (LMP, G/P, EDC, TT/Td) is copied only when this visit is
 * an explicit prenatal follow-up of an established pregnancy — never solely
 * because Maternal Care is Active.
 */
export function shouldPrefillPrenatalBaseline({
  continueRoute = false,
  followUps = [],
  enrolled = false,
  latestRecord = null,
} = {}) {
  if (!continueRoute || !enrolled || !latestRecord) return false;
  return (Array.isArray(followUps) ? followUps : []).some(isPrenatalAssociatedFollowUp);
}

/**
 * Continue-route Maternal Care stays unresolved until patient, records, and
 * continued follow-ups have settled. Restored drafts keep their saved selection.
 */
export function isMaternalServiceResolving({
  continueRoute = false,
  hasFollowUpSelection = false,
  resolved = false,
  patientLoading = false,
  recordsLoading = false,
  followUpsLoading = false,
} = {}) {
  if (resolved || !continueRoute || !hasFollowUpSelection) return false;
  return patientLoading || recordsLoading || followUpsLoading;
}

export function isMaternalServiceLoadFailed({
  continueRoute = false,
  hasFollowUpSelection = false,
  resolved = false,
  resolving = false,
  recordsError = false,
  followUpsError = false,
} = {}) {
  if (resolved || resolving || !continueRoute || !hasFollowUpSelection) return false;
  return recordsError || followUpsError;
}

export function canCompleteMaternalFollowUpResolution({
  resolved = false,
  restoring = false,
  resolving = false,
  loadFailed = false,
} = {}) {
  return !resolved && !restoring && !resolving && !loadFailed;
}

export function isMaternalLinkedToPrenatalFollowUp(followUps = [], selectedPrograms = []) {
  return (selectedPrograms || []).includes("Maternal")
    && (followUps || []).some(isPrenatalAssociatedFollowUp);
}

/**
 * Maternal Care controls on the service panel. Loading disables Include;
 * a failed load leaves Retry clickable; Active enrollment hides Include,
 * Continue, and Remove.
 */
export function maternalProgramControl({
  resolving = false,
  loadFailed = false,
  hideAction = false,
} = {}) {
  if (resolving) {
    return {
      disabled: true,
      disabledReason: MATERNAL_SERVICE_LOADING_LABEL,
      disabledNote: "Resolving Maternal Care for this visit.",
      busy: true,
      actionLabel: MATERNAL_SERVICE_LOADING_LABEL,
      hideAction: false,
    };
  }
  if (loadFailed) {
    return {
      disabled: false,
      disabledReason: "",
      disabledNote: "",
      busy: false,
      actionLabel: MATERNAL_SERVICE_RETRY_LABEL,
      hideAction: false,
    };
  }
  if (hideAction) {
    return {
      disabled: false,
      disabledReason: "",
      disabledNote: "",
      busy: false,
      actionLabel: "",
      hideAction: true,
    };
  }
  return {
    disabled: false,
    disabledReason: "",
    disabledNote: "",
    busy: false,
    actionLabel: "",
    hideAction: false,
  };
}

export function continuedCareBlocksProgress({
  followUpsLoading = false,
  resolving = false,
  loadFailed = false,
} = {}) {
  return Boolean(followUpsLoading || resolving || loadFailed);
}

/**
 * Confirm-only enrollment modal. No pregnancy fields are collected here.
 */
export function prenatalEnrollmentModalCopy({ enrolled } = {}) {
  if (enrolled) {
    return {
      title: "Continue Maternal Care",
      description:
        "This patient already has active Maternal Care. This visit adds the next prenatal assessment and does not start a second enrollment.",
      confirmText: "Continue This Visit",
    };
  }
  return {
    title: "Include Maternal Care",
    description:
      "Maternal Care will be included in this consultation. It becomes Active only after this consultation is finalized. Registration and Patient Background stay on the existing steps. Pregnancy details are recorded on the prenatal assessment.",
    confirmText: "Include in This Visit",
  };
}
