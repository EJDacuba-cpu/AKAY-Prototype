/**
 * Frozen ITR history stored on a health record at finalize. Details must
 * never fall back to live Patient Background when this is missing.
 */

import { BACKGROUND_SECTION_LABELS, backgroundChangeRows } from "./backgroundUpdate.js";
import { BHC_HIDDEN_SOCIAL_FIELDS } from "./backgroundEditing.js";

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

export function visitHistorySectionKeys(snapshot) {
  if (!snapshot) return [];
  return VISIT_HISTORY_SECTION_ORDER.filter((key) => Object.prototype.hasOwnProperty.call(snapshot.sections, key));
}

export function visitHistoryChangeRows(change, { hideMovedSocialFields = true } = {}) {
  if (!change || !BACKGROUND_SECTION_LABELS[change.section]) return [];
  return backgroundChangeRows(change.before || {}, change.after || {}, change.section).filter(
    (row) => !hideMovedSocialFields || change.section !== "social" || !BHC_HIDDEN_SOCIAL_FIELDS.includes(row.key),
  );
}
