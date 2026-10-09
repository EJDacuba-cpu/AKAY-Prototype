/**
 * The rows of the Health Concerns field (Assessment step): one text input per
 * concern, "Concern 1", "Concern 2", ... A row is a diagnosis entry (see
 * diagnoses.js) whose name is the text as typed.
 *
 * Only rows with text are concerns. Blank rows exist on screen only:
 * concernsFromRows drops them, so they never reach diagnoses[], the Care Plan,
 * drafts or the saved record.
 *
 * A row added on screen is `isNew` until it gets text; at that moment it takes
 * the visit's report default, as Add did before. Renaming keeps the row's id,
 * so its Care Plan choices stay attached.
 */
import { DIAGNOSIS_LIMITS, createDiagnosisId, normalizeNameKey } from "./diagnoses.js";
import { normalizeReportAs } from "./diagnosisReporting.js";
import { carePlanFor } from "./carePlan.js";

function isBlank(row) {
  return !String(row?.name || "").trim();
}

function blankRow(id = createDiagnosisId()) {
  return { id, name: "", isNew: true };
}

/** Rows for a list of concerns: one blank row when there are none. */
export function initialConcernRows(diagnoses) {
  const list = Array.isArray(diagnoses) ? diagnoses : [];
  return list.length > 0 ? list : [blankRow()];
}

/** The concerns the rows stand for: named rows only, names trimmed. */
export function concernsFromRows(rows) {
  return (rows || [])
    .filter((row) => !isBlank(row))
    .map((row) => ({ ...row, name: String(row.name).trim() }));
}

/** The rows with `id`'s text set to `text` (capped at the stored name length). */
export function editConcernRow(rows, id, text, defaultReportAs = null) {
  const name = String(text ?? "").slice(0, DIAGNOSIS_LIMITS.name);
  return rows.map((row) => {
    if (row.id !== id) return row;
    if (row.isNew && name.trim()) return { id: row.id, name, reportAs: normalizeReportAs(defaultReportAs) };
    return { ...row, name };
  });
}

/**
 * A blank row to type into: the existing blank row when there is one (never a
 * second), otherwise a new one at the end - none at the concern limit.
 * `focusId` is the row to focus, or null.
 */
export function addConcernRow(rows) {
  const existing = rows.find(isBlank);
  if (existing) return { rows, focusId: existing.id };
  if (rows.length >= DIAGNOSIS_LIMITS.count) return { rows, focusId: null };
  const row = blankRow();
  return { rows: [...rows, row], focusId: row.id };
}

/** The rows without `id`. The only row is cleared instead, so one is always left to type into. */
export function removeConcernRow(rows, id) {
  if (rows.length <= 1) return rows.map((row) => (row.id === id ? blankRow(row.id) : row));
  return rows.filter((row) => row.id !== id);
}

/**
 * Whether removing the row would discard a choice made in Care Plan & Next
 * Steps: a next action, surveillance, or a report type other than the visit's
 * default.
 */
export function hasCarePlanChoice(row, defaultReportAs = null) {
  if (!row) return false;
  if (carePlanFor(row) !== null || row.includeInSurveillance === true) return true;
  return Object.hasOwn(row, "reportAs") && normalizeReportAs(row.reportAs) !== normalizeReportAs(defaultReportAs);
}

/** Ids of rows repeating an earlier row's name (ignoring case and spaces). */
export function duplicateConcernIds(rows) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows || []) {
    const key = normalizeNameKey(row?.name);
    if (!key) continue;
    if (seen.has(key)) duplicates.add(row.id);
    seen.add(key);
  }
  return duplicates;
}

export function hasDuplicateConcerns(rows) {
  return duplicateConcernIds(rows).size > 0;
}

/**
 * The rows after the concerns changed outside the field (a restored draft, or
 * a choice set elsewhere). Rows that share no id with the new list are
 * replaced. Otherwise known rows take the new values - keeping the text as
 * typed when only its spacing differs - blank rows stay, and new concerns are
 * appended.
 */
export function syncConcernRows(rows, diagnoses) {
  const incoming = Array.isArray(diagnoses) ? diagnoses : [];
  const byId = new Map(incoming.map((entry) => [entry.id, entry]));
  if (!rows.some((row) => byId.has(row.id))) return initialConcernRows(incoming);

  const kept = new Set();
  const next = [];
  for (const row of rows) {
    const entry = byId.get(row.id);
    if (entry) {
      kept.add(row.id);
      next.push(entry.name === String(row.name).trim() ? { ...entry, name: row.name } : entry);
    } else if (isBlank(row)) {
      next.push(row);
    }
  }
  for (const entry of incoming) if (!kept.has(entry.id)) next.push(entry);
  return next;
}
