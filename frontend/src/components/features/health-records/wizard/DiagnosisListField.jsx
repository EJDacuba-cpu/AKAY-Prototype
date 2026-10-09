import { useEffect, useId, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DIAGNOSIS_LIMITS } from "../../../../utils/diagnoses";
import {
  addConcernRow,
  concernsFromRows,
  duplicateConcernIds,
  editConcernRow,
  hasCarePlanChoice,
  initialConcernRows,
  removeConcernRow,
  syncConcernRows,
} from "../../../../utils/concernRows";

/**
 * Health Concerns for the Assessment step: one numbered text input per concern
 * ("Concern 1", "Concern 2", ...), a trash button per row and "Add another
 * concern". There is no search and no suggestion list - the worker types the
 * concern and it is kept exactly as typed. Nothing is fuzzy-matched,
 * autocorrected or inferred. A concern never becomes a patient condition; its
 * optional next action is set in Care Plan & Next Steps.
 *
 * Each named row is still stored as a diagnosis (diagnoses[]) so Care Plan and
 * reporting keep working unchanged. Blank rows live only here (see
 * concernRows.js): onChange receives the named rows only.
 *
 * Editing works while the consultation is open; a saved record is never edited.
 */

const HEADING_CLASS = "text-[12px] font-bold uppercase tracking-wide text-[#111827]";
const LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]";
const ERROR_CLASS = "mt-1 text-[11px] font-medium text-[#DC2626]";
const DUPLICATE_TEXT = "Already added to this consultation.";
const NO_DIAGNOSES = [];

/**
 * @param diagnoses          [{ id, name, carePlan, reportAs, includeInSurveillance }]
 * @param onChange           receives the next list (named concerns only)
 * @param label              section heading
 * @param error              validation message for the concerns
 * @param defaultReportAs    the report choice a newly typed concern starts
 *                           with (changed in its Care Plan row)
 */
export default function DiagnosisListField({
  diagnoses = NO_DIAGNOSES,
  onChange,
  error,
  defaultReportAs = null,
  label = "Health Concerns",
}) {
  const baseId = useId();
  const inputRefs = useRef(new Map());
  const [rows, setRows] = useState(() => initialConcernRows(diagnoses));
  // The list the rows last matched; a different one changed outside this field.
  const [synced, setSynced] = useState(diagnoses);
  const [confirmingId, setConfirmingId] = useState(null);
  const [focusId, setFocusId] = useState(null);

  if (diagnoses !== synced) {
    setSynced(diagnoses);
    setRows(syncConcernRows(rows, diagnoses));
  }

  useEffect(() => {
    if (!focusId) return;
    inputRefs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const duplicates = duplicateConcernIds(rows);
  const atLimit = rows.length >= DIAGNOSIS_LIMITS.count;

  function commit(nextRows) {
    const next = concernsFromRows(nextRows);
    setRows(nextRows);
    setSynced(next);
    onChange(next);
  }

  function add() {
    const result = addConcernRow(rows);
    if (result.rows !== rows) commit(result.rows);
    if (result.focusId) setFocusId(result.focusId);
  }

  function remove(id) {
    const index = rows.findIndex((row) => row.id === id);
    const next = removeConcernRow(rows, id);
    setConfirmingId(null);
    commit(next);
    setFocusId(next[Math.max(0, index - 1)]?.id ?? null);
  }

  function requestRemove(row) {
    if (hasCarePlanChoice(row, defaultReportAs)) {
      setConfirmingId(row.id);
      return;
    }
    remove(row.id);
  }

  function cancelRemove(id) {
    setConfirmingId(null);
    setFocusId(id);
  }

  // Enter in the last row, once it has text, opens a new row; it never submits the form.
  function handleKeyDown(event, row, index) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!row.name.trim() || index !== rows.length - 1) return;
    add();
  }

  return (
    <div>
      <h3 id={`${baseId}-heading`} className={HEADING_CLASS}>
        {label}
      </h3>
      <p id={`${baseId}-help`} className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
        Record concerns identified during this visit. These are not confirmed diagnoses.
      </p>

      <ul aria-labelledby={`${baseId}-heading`} className="mt-3 space-y-3">
        {rows.map((row, index) => {
          const number = index + 1;
          const inputId = `${baseId}-concern-${row.id}`;
          const duplicate = duplicates.has(row.id);
          // A field error with no duplicate means a concern is missing: mark the blank rows.
          const invalid = duplicate || Boolean(error && duplicates.size === 0 && !row.name.trim());
          const onlyBlankRow = rows.length === 1 && !row.name.trim();
          return (
            <li key={row.id}>
              <label htmlFor={inputId} className={LABEL_CLASS}>
                Concern {number}
              </label>
              <div className="flex items-start gap-2">
                <input
                  id={inputId}
                  ref={(node) => {
                    if (node) inputRefs.current.set(row.id, node);
                    else inputRefs.current.delete(row.id);
                  }}
                  type="text"
                  value={row.name}
                  maxLength={DIAGNOSIS_LIMITS.name}
                  autoComplete="off"
                  placeholder="Describe health concern..."
                  aria-invalid={invalid || undefined}
                  aria-describedby={duplicate ? `${inputId}-error` : `${baseId}-help`}
                  onChange={(event) => commit(editConcernRow(rows, row.id, event.target.value, defaultReportAs))}
                  onKeyDown={(event) => handleKeyDown(event, row, index)}
                  className={`h-9 min-w-0 flex-1 rounded-none border bg-white px-3 text-sm text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] focus:border-[#DC2626] focus:ring-2 focus:ring-red-200 ${
                    invalid ? "border-[#DC2626]" : "border-[#D1D5DB]"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => requestRemove(row)}
                  disabled={onlyBlankRow}
                  aria-label={`Remove Concern ${number}`}
                  aria-expanded={confirmingId === row.id || undefined}
                  className="flex h-9 w-9 flex-none items-center justify-center text-[#6B7280] transition-colors duration-150 hover:bg-[#F9FAFB] hover:text-[#DC2626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#6B7280]"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>

              {duplicate && (
                <p id={`${inputId}-error`} className={ERROR_CLASS}>
                  {DUPLICATE_TEXT}
                </p>
              )}

              {confirmingId === row.id && (
                <div
                  role="group"
                  aria-label={`Confirm removing Concern ${number}`}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") cancelRemove(row.id);
                  }}
                  className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-none border border-amber-200 bg-amber-50 px-3 py-2"
                >
                  <p className="min-w-0 flex-1 text-xs font-semibold text-amber-800">
                    This concern has choices set in Care Plan &amp; Next Steps. Remove it?
                  </p>
                  <div className="flex flex-none gap-2">
                    <button
                      type="button"
                      onClick={() => cancelRemove(row.id)}
                      autoFocus
                      className="h-8 rounded-none border border-[#D1D5DB] bg-white px-3 text-xs font-semibold text-[#374151] hover:bg-[#F9FAFB]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      className="h-8 rounded-none bg-[#DC2626] px-3 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={add}
        disabled={atLimit}
        className="mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-none border border-[#DC2626] bg-white px-4 text-sm font-semibold text-[#DC2626] transition-colors duration-150 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
      >
        <Plus size={14} aria-hidden="true" />
        Add another concern
      </button>
      {atLimit && (
        <p className="mt-1 text-[11px] text-[#6B7280]">
          Up to {DIAGNOSIS_LIMITS.count} health concerns per consultation.
        </p>
      )}
      {error && <p className={ERROR_CLASS}>{error}</p>}
    </div>
  );
}
