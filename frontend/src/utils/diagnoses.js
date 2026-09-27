/**
 * Structured diagnoses typed on the consultation's Assessment step. Every
 * entry is written by the user - nothing is suggested or inferred - and only
 * entries with addToConditions go to the patient's Current Conditions, when
 * the consultation is saved (see CurrentConditionsSync on the backend).
 *
 * The record's plain-text `diagnosis` stays the copy every existing reader
 * uses (reports, referrals, follow-ups): it is the names joined with "; ".
 */

/** Same statuses as the Patient Profile's Current Conditions editor. */
export const CONDITION_STATUSES = ["Active", "Controlled", "Resolved"];

export const DIAGNOSIS_LIMITS = { name: 150, count: 20, notes: 5000 };

export function createDiagnosisId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Keeps only named entries, trimmed to the backend's limits. */
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
