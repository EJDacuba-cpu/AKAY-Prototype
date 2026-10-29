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

export function prenatalProgramCopy({ enrolled, included } = {}) {
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
