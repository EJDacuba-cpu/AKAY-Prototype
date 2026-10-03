import { useId, useRef, useState } from "react";
import { Star, X } from "lucide-react";
import {
  DIAGNOSIS_LIMITS,
  addDiagnosis,
  findCurrentCondition,
  getAddDiagnosisError,
  removeDiagnosis,
  toggleDiagnosisCondition,
} from "../../../../utils/diagnoses";

/**
 * Suspected Case for the Assessment step (the Barangay workflow's "suspected
 * case"): one always-visible text field with an Add button, and the added
 * cases as chips. There is no search and no suggestion list - the worker types
 * what is suspected and adds it exactly as typed. Nothing is fuzzy-matched,
 * autocorrected or inferred. A chip's star marks it for the patient's Current
 * Conditions (Active) when the consultation is saved; x removes it. There is
 * no edit - a mistake is removed and typed again.
 *
 * Each entry is still stored as a diagnosis (diagnoses[]) so Care Plan,
 * reporting and Current Conditions keep working unchanged.
 *
 * This component only adds, marks and removes entries.
 */

const LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]";
const ERROR_TEXT = {
  duplicate: "Already added to this consultation.",
  full: `A consultation can list up to ${DIAGNOSIS_LIMITS.count} suspected cases.`,
};

/**
 * @param diagnoses          [{ id, name, addToConditions, conditionStatus }]
 * @param onChange           receives the next list
 * @param canAddToConditions user may update Current Conditions (clinical.history)
 * @param currentConditions  the patient's medical_background.currentDiseases,
 *                           used only to say a marked diagnosis will be linked
 *                           rather than duplicated
 * @param label              field label ("New / Additional Working Diagnosis" when existing
 *                           monitoring is followed this visit)
 * @param error              validation message for the diagnosis
 * @param defaultReportAs    the report choice a newly added diagnosis starts
 *                           with (changed in its Care Plan row)
 */
export default function DiagnosisListField({
  diagnoses = [],
  onChange,
  canAddToConditions = false,
  currentConditions = [],
  error,
  defaultReportAs = null,
  label = "Suspected Case",
}) {
  const inputRef = useRef(null);
  const inputId = useId();
  const [text, setText] = useState("");

  const trimmed = text.trim();
  const addError = getAddDiagnosisError(diagnoses, trimmed);
  const shownError = addError === "duplicate" || addError === "full" ? ERROR_TEXT[addError] : "";

  function add(value = trimmed) {
    if (getAddDiagnosisError(diagnoses, value)) {
      inputRef.current?.focus();
      return;
    }
    onChange(addDiagnosis(diagnoses, value, defaultReportAs));
    setText("");
    inputRef.current?.focus();
  }

  function remove(item) {
    onChange(removeDiagnosis(diagnoses, item.id));
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    }
  }

  return (
    <div>
      <label htmlFor={inputId} className={LABEL_CLASS}>
        {label}
      </label>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input
            id={inputId}
            ref={inputRef}
            value={text}
            maxLength={DIAGNOSIS_LIMITS.name}
            aria-invalid={Boolean(shownError || error) || undefined}
            aria-describedby={shownError ? `${inputId}-hint` : undefined}
            autoComplete="off"
            placeholder="Type the suspected case…"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            className={`h-9 w-full rounded-none border bg-white px-3 text-sm text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] focus:border-[#DC2626] focus:ring-2 focus:ring-red-200 ${
              error ? "border-[#DC2626]" : "border-[#D1D5DB]"
            }`}
          />
        </div>
        <button
          type="button"
          onClick={() => add()}
          disabled={Boolean(addError)}
          className="h-9 flex-none bg-[#DC2626] px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {shownError && (
        <p id={`${inputId}-hint`} className="mt-1 text-[11px] font-medium text-[#DC2626]">
          {shownError}
        </p>
      )}
      {error && <p className="mt-1 text-[11px] font-medium text-[#DC2626]">{error}</p>}

      {diagnoses.length > 0 && (
        <ul aria-label="Added suspected cases" className="mt-2 flex flex-wrap gap-1.5">
          {diagnoses.map((item) => {
            const linked = item.addToConditions ? findCurrentCondition(currentConditions, item.name) : null;
            const starLabel = item.addToConditions
              ? linked
                ? `Already in Current Conditions (${linked.status || "Active"}) — will be linked, not duplicated`
                : `Current Condition · ${item.conditionStatus || "Active"}`
              : "Not a Current Condition";
            return (
              <li
                key={item.id}
                className={`inline-flex max-w-full items-center gap-0.5 rounded-sm border py-0.5 pl-2 pr-0.5 text-[13px] font-semibold ${
                  item.addToConditions
                    ? "border-red-200 bg-red-50 text-[#111827]"
                    : "border-[#D1D5DB] bg-[#F9FAFB] text-[#111827]"
                }`}
              >
                <span className="min-w-0 break-words">{item.name}</span>
                {canAddToConditions ? (
                  <button
                    type="button"
                    onClick={() => onChange(toggleDiagnosisCondition(diagnoses, item.id))}
                    aria-pressed={item.addToConditions}
                    aria-label={`${item.name}: add to Current Conditions`}
                    title={item.addToConditions ? starLabel : "Add to Current Conditions (Active)"}
                    className="flex h-6 w-6 flex-none items-center justify-center text-[#6B7280] hover:bg-white hover:text-[#DC2626]"
                  >
                    <Star
                      size={13}
                      aria-hidden="true"
                      className={item.addToConditions ? "fill-[#DC2626] text-[#DC2626]" : ""}
                    />
                  </button>
                ) : (
                  item.addToConditions && (
                    <span title={starLabel} className="flex h-6 w-6 flex-none items-center justify-center">
                      <Star size={13} aria-label={starLabel} className="fill-[#DC2626] text-[#DC2626]" />
                    </span>
                  )
                )}
                <button
                  type="button"
                  onClick={() => remove(item)}
                  aria-label={`Remove ${item.name}`}
                  className="flex h-6 w-6 flex-none items-center justify-center text-[#6B7280] hover:bg-white hover:text-[#DC2626]"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {diagnoses.some((item) => item.addToConditions) && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[#6B7280]">
          <Star size={11} aria-hidden="true" className="fill-[#DC2626] text-[#DC2626]" />
          Added to Current Conditions as Active when this consultation is saved.
        </p>
      )}

    </div>
  );
}
