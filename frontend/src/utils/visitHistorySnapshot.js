/**
 * Frozen ITR history stored on a health record at finalize. Details must
 * never fall back to live Patient Background when this is missing.
 */

import { informantPayload, similarIllnessPayload } from "./historyStep.js";

export const VISIT_HISTORY_SECTION_ORDER = ["family", "medical", "social", "obstetric"];

export function visitHistorySnapshot(record) {
  const raw = record?.historySnapshot || record?.history_snapshot || null;
  if (!raw || typeof raw !== "object" || !raw.sections || typeof raw.sections !== "object") {
    return null;
  }
  return {
    sections: raw.sections,
    changes: Array.isArray(raw.changes) ? raw.changes : [],
  };
}

function joinedLine(parts) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(" · ");
}

/** Informant as stored on this visit, or "". */
export function visitHistoryInformantLine(record) {
  const informant = informantPayload(record?.informant);
  return informant ? joinedLine([informant.relation, informant.name]) : "";
}

/** Similar illness in the family as stored on this visit, or "". */
export function visitHistorySimilarIllnessLine(record) {
  const similar = similarIllnessPayload(record?.similarIllness || record?.similar_illness);
  return similar ? joinedLine([similar.answer, similar.who, similar.note]) : "";
}

export function visitHistorySectionKeys(snapshot) {
  if (!snapshot) return [];
  return VISIT_HISTORY_SECTION_ORDER.filter((key) => Object.prototype.hasOwnProperty.call(snapshot.sections, key));
}
