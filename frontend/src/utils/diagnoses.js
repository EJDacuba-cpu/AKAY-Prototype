/**
 * Structured health concerns typed on the consultation's Assessment step
 * (stored as `diagnoses`). Every entry is chosen by the user - nothing is
 * inferred. A concern never becomes or changes a patient's condition: the
 * RHU confirms conditions, and each concern only carries an optional next
 * action (see carePlan.js).
 *
 * The record's plain-text `diagnosis` stays the copy every existing reader
 * uses (reports, referrals, follow-ups): it is the names joined with "; ".
 *
 * The Health Concerns field (the Assessment step) has no search or suggestions:
 * the worker types the concern and it is kept exactly as typed.
 *
 * `reportAs` (Morbidity / Notifiable / not reported) is chosen per diagnosis
 * in its Care Plan row - see diagnosisReporting.js.
 */
import { normalizeReportAs } from "./diagnosisReporting.js";
import { isCarePlanValue } from "./carePlan.js";

/** Case/whitespace-insensitive key for comparing diagnosis or condition names. */
export function normalizeNameKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export const DIAGNOSIS_LIMITS = { name: 150, count: 20, notes: 5000 };

export function createDiagnosisId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * True when another diagnosis already in this consultation has the same name
 * (ignoring case and extra spaces). excludeId lets an entry being edited skip
 * comparing against itself.
 */
export function isDuplicateDiagnosisName(diagnoses, name, excludeId) {
  const key = normalizeNameKey(name);
  if (!key) return false;
  return (diagnoses || []).some(
    (entry) => entry.id !== excludeId && normalizeNameKey(entry.name) === key,
  );
}

/**
 * Why `name` cannot be added right now, or null when it can:
 * "empty" | "duplicate" | "full".
 */
export function getAddDiagnosisError(diagnoses, name) {
  if (!String(name || "").trim()) return "empty";
  if (isDuplicateDiagnosisName(diagnoses, name)) return "duplicate";
  if ((diagnoses || []).length >= DIAGNOSIS_LIMITS.count) return "full";
  return null;
}

/**
 * The list with `name` appended as a new diagnosis, or the list unchanged if
 * it cannot be added. The text is kept exactly as typed (trimmed).
 * A new entry has no next action; its report choice starts at `reportAs`
 * (the caller's default for this visit).
 */
export function addDiagnosis(diagnoses, name, reportAs = null) {
  const list = diagnoses || [];
  if (getAddDiagnosisError(list, name)) return list;
  const text = String(name).trim().slice(0, DIAGNOSIS_LIMITS.name);
  return [
    ...list,
    {
      id: createDiagnosisId(),
      name: text,
      reportAs: normalizeReportAs(reportAs),
    },
  ];
}

export function removeDiagnosis(diagnoses, id) {
  return (diagnoses || []).filter((entry) => entry.id !== id);
}

/**
 * Keeps only named entries, trimmed to the backend's limits. `reportAs` is
 * kept only when the source entry had the key: its presence is what marks a
 * list as recorded with per-diagnosis reporting (usesDiagnosisReporting), so
 * a record saved before that must not gain it here.
 */
export function normalizeDiagnoses(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && String(item.name || "").trim())
    .slice(0, DIAGNOSIS_LIMITS.count)
    .map((item) => ({
      id: String(item.id || createDiagnosisId()).slice(0, 64),
      name: String(item.name).trim().slice(0, DIAGNOSIS_LIMITS.name),
      ...(Object.hasOwn(item, "reportAs") ? { reportAs: normalizeReportAs(item.reportAs) } : {}),
      // A stored record may hold a retired value; carePlanFor decides what is a choice.
      ...(isCarePlanValue(item.carePlan) ? { carePlan: item.carePlan } : {}),
      ...(item.includeInSurveillance === true ? { includeInSurveillance: true } : {}),
    }));
}

/** The plain-text `diagnosis` copy: "Asthma; Allergic rhinitis". */
export function joinDiagnosisNames(list) {
  return normalizeDiagnoses(list).map((item) => item.name).join("; ");
}

/** "Asthma; Allergic rhinitis" - for summaries. */
export function formatDiagnoses(list) {
  return joinDiagnosisNames(list);
}

/**
 * Diagnoses to show when a draft or record is reopened. Drafts and records
 * from before the structured list only have the free-text `diagnosis`; that
 * text is kept as it was typed - one entry when it fits a diagnosis name, or
 * moved to the assessment notes when it is longer - never split or reworded.
 */
export function restoreDiagnoses({ diagnoses, diagnosis, assessmentNotes }) {
  const list = normalizeDiagnoses(diagnoses);
  const notes = String(assessmentNotes || "");
  const legacy = String(diagnosis || "").trim();
  if (list.length > 0 || !legacy) return { diagnoses: list, assessmentNotes: notes };
  if (legacy.length <= DIAGNOSIS_LIMITS.name) {
    return { diagnoses: [{ id: createDiagnosisId(), name: legacy }], assessmentNotes: notes };
  }
  return { diagnoses: [], assessmentNotes: notes ? `${legacy}\n\n${notes}` : legacy };
}
