import { useId, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  DIAGNOSIS_LIMITS,
  addDiagnosis,
  getAddDiagnosisError,
  removeDiagnosis,
} from "../../../../utils/diagnoses";

/**
 * Health Concerns for the Assessment step: one always-visible text field with
 * an Add button, and the added concerns as chips. There is no search and no
 * suggestion list - the worker types the concern and adds it exactly as typed.
 * Nothing is fuzzy-matched, autocorrected or inferred. x removes a chip. There
 * is no edit - a mistake is removed and typed again. A concern never becomes a
 * patient condition; its optional next action is set in Care Plan & Next Steps.
 *
 * Each entry is still stored as a diagnosis (diagnoses[]) so Care Plan and
 * reporting keep working unchanged.
 *
 * This component only adds and removes entries.
 */

const LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]";
const ERROR_TEXT = {
  duplicate: "Already added to this consultation.",
  full: `A consultation can list up to ${DIAGNOSIS_LIMITS.count} health concerns.`,
};

/**
 * @param diagnoses          [{ id, name, carePlan, reportAs, includeInSurveillance }]
 * @param onChange           receives the next list
 * @param label              field label
 * @param error              validation message for the concerns
 * @param defaultReportAs    the report choice a newly added concern starts
 *                           with (changed in its Care Plan row)
 */
export default function DiagnosisListField({
  diagnoses = [],
  onChange,
  error,
  defaultReportAs = null,
  label = "Health Concerns",
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
            placeholder="Type a health concern…"
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
        <ul aria-label="Added health concerns" className="mt-2 flex flex-wrap gap-1.5">
          {diagnoses.map((item) => (
            <li
              key={item.id}
              className="inline-flex max-w-full items-center gap-0.5 rounded-sm border border-[#D1D5DB] bg-[#F9FAFB] py-0.5 pl-2 pr-0.5 text-[13px] font-semibold text-[#111827]"
            >
              <span className="min-w-0 break-words">{item.name}</span>
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={`Remove ${item.name}`}
                className="flex h-6 w-6 flex-none items-center justify-center text-[#6B7280] hover:bg-white hover:text-[#DC2626]"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
