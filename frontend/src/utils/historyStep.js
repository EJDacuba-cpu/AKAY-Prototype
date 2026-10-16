/**
 * Glue between the visit's history questions (the RHU Patient History step,
 * the BHC Patient Interview) and the record / draft payloads:
 * the per-visit informant and similar-illness answers in the shape the API
 * accepts, and the server's 422 keys turned into lines staff can act on.
 * Pure functions only - no React, no API.
 */

import { BACKGROUND_SECTION_LABELS } from "./backgroundUpdate.js";

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

/**
 * The informant as the API takes it, or null. The server requires a relation
 * whenever an informant is sent, so one without a relation is not sent at all.
 */
export function informantPayload(informant) {
  const relation = text(informant?.relation);
  if (!relation) return null;
  const id = Number(informant?.patientId);
  return {
    relation,
    name: text(informant?.name),
    patientId: Number.isInteger(id) && id > 0 ? id : null,
  };
}

/** The similar-illness answer as the API takes it, or null when unanswered. */
export function similarIllnessPayload(similarIllness) {
  const answer = text(similarIllness?.answer);
  if (!answer) return null;
  return { answer, who: text(similarIllness?.who), note: text(similarIllness?.note) };
}

/**
 * The visit answers as the draft payload stores them: each key only once it is
 * answered, and nothing without clinical.history (`allowed`).
 */
export function visitAnswerDraftFields({ informant, similarIllness, allowed } = {}) {
  if (!allowed) return {};
  const given = informantPayload(informant);
  const similar = similarIllnessPayload(similarIllness);
  return {
    ...(given ? { informant: given } : {}),
    ...(similar ? { similarIllness: similar } : {}),
  };
}

/**
 * The visit answers as the finalized record payload sends them: both keys
 * always, null when unanswered or without clinical.history (`allowed`).
 */
export function visitAnswerRecordFields({ informant, similarIllness, allowed } = {}) {
  return {
    informant: allowed ? informantPayload(informant) : null,
    similarIllness: allowed ? similarIllnessPayload(similarIllness) : null,
  };
}

/**
 * The per-visit answers as Review rows ({ label, value }), each only when it
 * was answered - an unanswered informant or similar illness is left out
 * rather than shown blank.
 */
export function visitAnswerRows({ informant, similarIllness } = {}) {
  const rows = [];
  const given = informantPayload(informant);
  if (given) {
    rows.push({ label: "Informant", value: [given.relation, given.name].filter(Boolean).join(" · ") });
  }
  const similar = similarIllnessPayload(similarIllness);
  if (similar) {
    rows.push({
      label: "Similar illness in the family",
      value: [similar.answer, similar.who, similar.note].filter(Boolean).join(" · "),
    });
  }
  return rows;
}

/**
 * The patient's linked family members (mother and father records), for the
 * Family History relative picker. Only entries with an id can be linked.
 */
export function linkedRelatives(patient) {
  return [patient?.motherPatient, patient?.fatherPatient].filter(
    (relative) => relative && typeof relative === "object" && text(relative.id ?? relative.patientId),
  );
}

// Field names inside a section, as the history screens label them.
const FIELD_LABELS = {
  currentDiseases: "Patient-reported Conditions",
  allergies: "Allergies",
  hospitalizations: "Hospitalizations & Surgeries",
  familyHistory: "Family Conditions",
  education: "Education",
  pastOccupations: "Past Occupations",
  smoking: "Smoking",
  alcohol: "Alcohol",
  diet: "Diet",
  sexual: "Sexual History",
  environment: "Household Environment",
  pregnancies: "Pregnancies",
};
// Wrapper keys that add nothing a reader needs.
const SKIPPED = new Set(["personalSocial", "obstetric", "items"]);

function humanize(segment) {
  return String(segment)
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

function isHistoryKey(key) {
  return key.startsWith("background_update") || key.startsWith("informant") || key.startsWith("similar_illness");
}

/** Where the error points: { section, context, leaf }. */
function locate(key) {
  const segments = key.split(".");
  const leaf = segments.length > 1 ? segments[segments.length - 1] : "";

  if (segments[0] === "informant") return { section: "general", context: "Informant", leaf };
  if (segments[0] === "similar_illness") return { section: "family", context: "Similar Illness", leaf };
  if (segments[1] !== "sections" || !BACKGROUND_SECTION_LABELS[segments[2]]) {
    return { section: null, context: "Patient History", leaf };
  }

  const section = segments[2];
  const parts = [];
  segments.slice(3, -1).forEach((segment) => {
    if (/^\d+$/.test(segment)) {
      if (parts.length) parts[parts.length - 1] += `, entry ${Number(segment) + 1}`;
      return;
    }
    if (SKIPPED.has(segment)) return;
    parts.push(FIELD_LABELS[segment] || humanize(segment));
  });
  return {
    section,
    context: [BACKGROUND_SECTION_LABELS[section], ...parts].join(" · "),
    leaf: segments.length > 3 ? leaf : "section",
  };
}

/**
 * The Patient History errors of a 422 (`errors` is { key: message }), one
 * readable line each: "Past Medical History · Hospitalizations & Surgeries,
 * entry 1: The type field is required." Other keys are left out. With
 * `withSection`, each line comes as { section, text } so the panel can open
 * the section it belongs to.
 */
export function historyErrorMessages(errors, { withSection = false } = {}) {
  return Object.entries(errors || {})
    .filter(([key, message]) => isHistoryKey(key) && message)
    .map(([key, message]) => {
      const { section, context, leaf } = locate(key);
      const readable = humanize(leaf);
      const body = String(message)
        .split(key)
        .join(readable)
        .split(key.replace(/_/g, " "))
        .join(readable);
      const line = `${context}: ${body}`;
      return withSection ? { section, text: line } : line;
    });
}

/** The 422 lines for the visit questions only (Informant, Similar Illness). */
export function visitAnswerErrorMessages(errors) {
  return historyErrorMessages(
    Object.fromEntries(
      Object.entries(errors || {}).filter(([key]) => key.startsWith("informant") || key.startsWith("similar_illness")),
    ),
  );
}
