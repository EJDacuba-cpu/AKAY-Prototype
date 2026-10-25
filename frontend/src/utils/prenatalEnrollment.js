import { getCareTracking } from "./careTracking.js";
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

export function prenatalProgramCopy({ enrolled, included } = {}) {
  return {
    enrollLabel: enrolled ? "Continue Prenatal Care" : "Enroll in Prenatal Care",
    statusLabel: enrolled
      ? included
        ? "Continuing this visit"
        : "Active"
      : included
        ? "Included this visit"
        : "Not enrolled",
    statusTone: enrolled ? "active" : included ? "included" : "neutral",
  };
}
