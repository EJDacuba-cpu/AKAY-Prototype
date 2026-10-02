/**
 * Structured diagnoses typed on the consultation's Assessment step. Every
 * entry is chosen by the user - nothing is inferred - and only
 * entries with addToConditions go to the patient's Current Conditions, when
 * the consultation is saved (see CurrentConditionsSync on the backend).
 *
 * The record's plain-text `diagnosis` stays the copy every existing reader
 * uses (reports, referrals, follow-ups): it is the names joined with "; ".
 *
 * The Suspected Case field (the Assessment step) has no search or suggestions:
 * the worker types the case and it is kept exactly as typed. The backend's ClinicalRegistry
 * (config/clinical_registry.php) is the source of truth for which diagnoses
 * are registered monitored conditions (HTN, DM, PTB ... by name or alias) and
 * what auto-syncs to Current Conditions; it renames a matched diagnosis to its
 * official name when the consultation is saved.
 *
 * `reportAs` (Morbidity / Notifiable / not reported) is chosen per diagnosis
 * under Records & Surveillance - see diagnosisReporting.js.
 */
import { normalizeReportAs } from "./diagnosisReporting.js";
import { isCarePlanValue } from "./carePlan.js";

/** Case/whitespace-insensitive key for comparing diagnosis or condition names. */
export function normalizeNameKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Same statuses as the Patient Profile's Current Conditions editor. */
export const CONDITION_STATUSES = ["Active", "Controlled", "Resolved"];

export const DIAGNOSIS_LIMITS = { name: 150, count: 20, notes: 5000 };

export function createDiagnosisId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The patient's existing Current Condition with this exact name (ignoring
 * case and extra spaces), if any - used only to tell the user it will be
 * linked rather than duplicated. Never used to alter what they typed.
 */
export function findCurrentCondition(currentConditions, name) {
  const key = normalizeNameKey(name);
  if (!key || !Array.isArray(currentConditions)) return null;
  return currentConditions.find((condition) => normalizeNameKey(condition?.name) === key) || null;
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
 * New entries are not Current Conditions until the worker marks them; their
 * report choice starts at `reportAs` (the caller's default for this visit).
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
      addToConditions: false,
      conditionStatus: null,
      reportAs: normalizeReportAs(reportAs),
    },
  ];
}

/** Marks or unmarks one diagnosis as a Current Condition (always Active). */
export function toggleDiagnosisCondition(diagnoses, id) {
  return (diagnoses || []).map((entry) =>
    entry.id === id
      ? { ...entry, addToConditions: !entry.addToConditions, conditionStatus: entry.addToConditions ? null : "Active" }
      : entry,
  );
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
    .map((item) => {
      const addToConditions = item.addToConditions === true;
      return {
        id: String(item.id || createDiagnosisId()).slice(0, 64),
        name: String(item.name).trim().slice(0, DIAGNOSIS_LIMITS.name),
        addToConditions,
        conditionStatus: addToConditions
          ? (CONDITION_STATUSES.includes(item.conditionStatus) ? item.conditionStatus : "Active")
          : null,
        ...(Object.hasOwn(item, "reportAs") ? { reportAs: normalizeReportAs(item.reportAs) } : {}),
        ...(isCarePlanValue(item.carePlan) ? { carePlan: item.carePlan } : {}),
        ...(item.includeInSurveillance === true ? { includeInSurveillance: true } : {}),
      };
    });
}

/** The plain-text `diagnosis` copy: "Asthma; Allergic rhinitis". */
export function joinDiagnosisNames(list) {
  return normalizeDiagnoses(list).map((item) => item.name).join("; ");
}

/** "Asthma (Current Conditions: Active); Allergic rhinitis" - for summaries. */
export function formatDiagnoses(list) {
  return normalizeDiagnoses(list)
    .map((item) => (item.addToConditions ? `${item.name} (Current Conditions: ${item.conditionStatus})` : item.name))
    .join("; ");
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
    return { diagnoses: [{ id: createDiagnosisId(), name: legacy, addToConditions: false, conditionStatus: null }], assessmentNotes: notes };
  }
  return { diagnoses: [], assessmentNotes: notes ? `${legacy}\n\n${notes}` : legacy };
}
