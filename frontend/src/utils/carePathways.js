/**
 * Structured diagnoses and the care pathways they make available - the ONE
 * place this mapping lives. Components ask these helpers; they never compare
 * a diagnosis name to "Hypertension" themselves.
 *
 * Diagnosis and care pathway stay separate concepts: a diagnosis is the
 * clinical impression recorded for this visit; a care pathway is an optional,
 * longitudinal monitoring workflow the health worker may choose to start. A
 * matching diagnosis only makes a pathway AVAILABLE - nothing is started,
 * classified or inferred automatically.
 *
 * Adding a verified condition later: one STRUCTURED_DIAGNOSES entry, and a
 * CARE_PATHWAYS entry if it opens a new pathway (its programKey must be a
 * ConsultationPrograms key).
 */

/** Diagnoses offered as structured suggestions, and the pathway each feeds. */
export const STRUCTURED_DIAGNOSES = Object.freeze([
  Object.freeze({ name: "Hypertension", pathwayKey: "NCD" }),
  Object.freeze({ name: "Diabetes Mellitus", pathwayKey: "NCD" }),
]);

export const CARE_PATHWAYS = Object.freeze({
  NCD: Object.freeze({
    key: "NCD",
    label: "NCD Monitoring",
    // The ConsultationPrograms key Start Monitoring selects.
    programKey: "NCD",
  }),
});

/** Case/whitespace-insensitive key for comparing diagnosis or condition names. */
export function normalizeNameKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function getStructuredDiagnosisNames() {
  return STRUCTURED_DIAGNOSES.map((entry) => entry.name);
}

/**
 * The structured diagnosis this name is, or null. Exact match ignoring case
 * and extra spaces only - no substring, fuzzy or typo matching.
 */
export function findStructuredDiagnosis(name) {
  const key = normalizeNameKey(name);
  if (!key) return null;
  return STRUCTURED_DIAGNOSES.find((entry) => normalizeNameKey(entry.name) === key) || null;
}

/**
 * Pathways the recorded diagnoses make available, one entry per pathway
 * however many of its diagnoses are present:
 * [{ pathwayKey, label, programKey, matchedDiagnoses: ["Hypertension", ...] }]
 * matchedDiagnoses use the structured spelling, in registry order.
 */
export function getSuggestedCarePathways(diagnoses) {
  const present = new Set(
    (diagnoses || []).map((item) => findStructuredDiagnosis(item?.name)?.name).filter(Boolean),
  );
  const result = [];
  for (const pathway of Object.values(CARE_PATHWAYS)) {
    const matchedDiagnoses = STRUCTURED_DIAGNOSES.filter(
      (entry) => entry.pathwayKey === pathway.key && present.has(entry.name),
    ).map((entry) => entry.name);
    if (matchedDiagnoses.length > 0) {
      result.push({ pathwayKey: pathway.key, label: pathway.label, programKey: pathway.programKey, matchedDiagnoses });
    }
  }
  return result;
}

/** The structured diagnoses of one pathway present in the list, e.g. for the NCD form. */
export function getPathwayDiagnoses(pathwayKey, diagnoses) {
  return getSuggestedCarePathways(diagnoses).find((item) => item.pathwayKey === pathwayKey)?.matchedDiagnoses || [];
}

export function pathwayHasLinkedDiagnosis(pathwayKey, diagnoses) {
  return getPathwayDiagnoses(pathwayKey, diagnoses).length > 0;
}

/**
 * The started pathway a change would leave with none of its diagnoses, or
 * null. `nextDiagnoses` is the list as it would be after the remove/edit.
 * Used to ask before the change - a started pathway is never turned off here.
 */
export function findOrphanedPathway(currentDiagnoses, nextDiagnoses, selectedPrograms) {
  for (const pathway of Object.values(CARE_PATHWAYS)) {
    if (!(selectedPrograms || []).includes(pathway.programKey)) continue;
    if (pathwayHasLinkedDiagnosis(pathway.key, currentDiagnoses) && !pathwayHasLinkedDiagnosis(pathway.key, nextDiagnoses)) {
      return pathway;
    }
  }
  return null;
}
