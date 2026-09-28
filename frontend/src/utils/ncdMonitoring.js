/**
 * NCD Monitoring data, stored as monitoring_data.ncdData.
 *
 * It holds ONLY what is specific to NCD monitoring: which conditions are
 * monitored, and each condition's own fields. Vital signs are never copied in
 * - the monitoring form reads the consultation's vital signs.
 *
 * The monitored conditions always follow the recorded diagnoses (carePathways
 * registry); they are not picked a second time. A condition's fields appear
 * only while that condition is monitored - FBS belongs to Diabetes Mellitus,
 * not to NCD Monitoring as a whole. Another verified condition's fields are
 * one NCD_CONDITION_SECTIONS entry (plus the matching backend rule).
 */
import { getPathwayDiagnoses } from "./carePathways.js";

export const NCD_PATHWAY_KEY = "NCD";

export const NCD_CONDITION_SECTIONS = Object.freeze([
  Object.freeze({
    condition: "Diabetes Mellitus",
    key: "diabetes",
    title: "Diabetes Mellitus",
    fields: Object.freeze([
      Object.freeze({ key: "fbs", label: "Fasting Blood Sugar (FBS)", placeholder: "e.g. 95 mg/dL", maxLength: 100 }),
    ]),
  }),
]);

export const EMPTY_NCD_DATA = Object.freeze({ conditions: [], diabetes: Object.freeze({ fbs: "" }) });

/** A stored or drafted ncdData, reduced to the known shape. */
export function normalizeNcdData(value) {
  const source = value && typeof value === "object" ? value : {};
  const result = {
    conditions: Array.isArray(source.conditions) ? source.conditions.filter((item) => typeof item === "string") : [],
  };
  for (const section of NCD_CONDITION_SECTIONS) {
    const stored = source[section.key] && typeof source[section.key] === "object" ? source[section.key] : {};
    result[section.key] = Object.fromEntries(
      section.fields.map((field) => [field.key, stored[field.key] == null ? "" : String(stored[field.key])]),
    );
  }
  return result;
}

/** The sections to show: those whose condition is currently diagnosed. */
export function getActiveNcdSections(diagnoses) {
  const conditions = getPathwayDiagnoses(NCD_PATHWAY_KEY, diagnoses);
  return NCD_CONDITION_SECTIONS.filter((section) => conditions.includes(section.condition));
}

/** Review & Confirm rows, labelled with the form's own field labels. */
export function ncdReviewRows(value, diagnoses) {
  const data = buildNcdData(value, diagnoses);
  return [
    { label: "Monitored Conditions", value: data.conditions.join(", ") },
    ...getActiveNcdSections(diagnoses).flatMap((section) =>
      section.fields.map((field) => ({ label: field.label, value: data[section.key][field.key] })),
    ),
  ];
}

/**
 * What is saved: the conditions taken from the diagnoses, and only the
 * sections of conditions still diagnosed (a hidden section's leftover value
 * is not kept).
 */
export function buildNcdData(value, diagnoses) {
  const data = normalizeNcdData(value);
  const result = { conditions: getPathwayDiagnoses(NCD_PATHWAY_KEY, diagnoses) };
  for (const section of getActiveNcdSections(diagnoses)) {
    result[section.key] = Object.fromEntries(
      section.fields.map((field) => [field.key, String(data[section.key][field.key] || "").trim()]),
    );
  }
  return result;
}
