import { useId, useRef, useState } from "react";
import { Star, X } from "lucide-react";
import {
  DIAGNOSIS_LIMITS,
  addDiagnosis,
  filterDiagnosisSuggestions,
  findCurrentCondition,
  getAddDiagnosisError,
  removeDiagnosis,
  toggleDiagnosisCondition,
} from "../../../../utils/diagnoses";
import { findOrphanedPathway, findStructuredDiagnosis } from "../../../../utils/carePathways";

/**
 * Diagnosis / Clinical Impression for the Assessment step: one always-visible
 * searchable field with an Add button, and the added diagnoses as chips.
 *
 * The field suggests only the registry's structured diagnoses
 * (carePathways.js); anything else is added exactly as typed. Nothing is
 * fuzzy-matched, autocorrected or inferred. A chip's star marks it for the
 * patient's Current Conditions (Active) when the consultation is saved; × removes
 * it. There is no edit - a mistake is removed and typed again.
 *
 * Care pathways are not chosen here (see CarePathwaySuggestions). The only
 * link is a guard: removing the last diagnosis behind a pathway that was
 * already started asks first, and never turns the pathway off.
 */

const LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]";
const ERROR_TEXT = {
  duplicate: "Already added to this consultation.",
  full: `A consultation can list up to ${DIAGNOSIS_LIMITS.count} diagnoses.`,
};

/**
 * @param diagnoses          [{ id, name, addToConditions, conditionStatus }]
 * @param onChange           receives the next list
 * @param canAddToConditions user may update Current Conditions (clinical.history)
 * @param currentConditions  the patient's medical_background.currentDiseases,
 *                           used only to say a marked diagnosis will be linked
 *                           rather than duplicated
 * @param selectedPrograms   the consultation's programs, to know which care
 *                           pathways are already started
 * @param error              validation message for the diagnosis
 */
export default function DiagnosisListField({
  diagnoses = [],
  onChange,
  canAddToConditions = false,
  currentConditions = [],
  selectedPrograms = [],
  error,
}) {
  const inputRef = useRef(null);
  const listboxId = useId();
  const [text, setText] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // { item, pathway } - a removal waiting for "Remove anyway".
  const [pendingRemoval, setPendingRemoval] = useState(null);

  const trimmed = text.trim();
  const addError = getAddDiagnosisError(diagnoses, trimmed);
  const shownError = addError === "duplicate" || addError === "full" ? ERROR_TEXT[addError] : "";
  // Structured suggestions first; typed text that is not one of them can be
  // added as it is.
  const options = [
    ...filterDiagnosisSuggestions(text).map((value) => ({ kind: "suggestion", value })),
    ...(trimmed && !findStructuredDiagnosis(trimmed) ? [{ kind: "custom", value: trimmed }] : []),
  ];
  const showOptions = optionsOpen && options.length > 0;

  function closeOptions() {
    setOptionsOpen(false);
    setActiveIndex(-1);
  }

  function add(value = trimmed) {
    if (getAddDiagnosisError(diagnoses, value)) {
      inputRef.current?.focus();
      return;
    }
    onChange(addDiagnosis(diagnoses, value));
    setText("");
    closeOptions();
    inputRef.current?.focus();
  }

  function remove(item) {
    const next = removeDiagnosis(diagnoses, item.id);
    const pathway = findOrphanedPathway(diagnoses, next, selectedPrograms);
    if (pathway) {
      setPendingRemoval({ item, pathway });
      return;
    }
    onChange(next);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      setOptionsOpen(true);
      setActiveIndex((prev) => (prev + 1) % options.length);
      return;
    }
    if (event.key === "ArrowUp" && options.length > 0) {
      event.preventDefault();
      setOptionsOpen(true);
      setActiveIndex((prev) => (prev <= 0 ? options.length - 1 : prev - 1));
      return;
    }
    if (event.key === "Escape" && showOptions) {
      event.preventDefault();
      closeOptions();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      add(showOptions && activeIndex >= 0 && options[activeIndex] ? options[activeIndex].value : trimmed);
    }
  }

  return (
    <div>
      <label htmlFor={`${listboxId}-input`} className={LABEL_CLASS}>
        Diagnosis / Clinical Impression
      </label>

      <div className="flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            id={`${listboxId}-input`}
            ref={inputRef}
            value={text}
            maxLength={DIAGNOSIS_LIMITS.name}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showOptions}
            aria-controls={listboxId}
            aria-activedescendant={showOptions && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
            aria-invalid={Boolean(shownError || error) || undefined}
            aria-describedby={shownError ? `${listboxId}-hint` : undefined}
            autoComplete="off"
            placeholder="Search or type diagnosis…"
            onChange={(event) => {
              setText(event.target.value);
              setOptionsOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOptionsOpen(true)}
            onBlur={closeOptions}
            onKeyDown={handleKeyDown}
            className={`h-9 w-full rounded-none border bg-white px-3 text-sm text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] focus:border-[#DC2626] focus:ring-2 focus:ring-red-200 ${
              error ? "border-[#DC2626]" : "border-[#D1D5DB]"
            }`}
          />
          {showOptions && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Diagnosis options"
              className="absolute left-0 right-0 top-full z-10 mt-1 border border-[#D1D5DB] bg-white shadow-md"
            >
              {options.map((option, index) => {
                const active = index === activeIndex;
                const blocked = Boolean(getAddDiagnosisError(diagnoses, option.value));
                return (
                  <li key={`${option.kind}-${option.value}`} role="presentation">
                    <button
                      type="button"
                      id={`${listboxId}-option-${index}`}
                      role="option"
                      aria-selected={active}
                      aria-disabled={blocked || undefined}
                      disabled={blocked}
                      // Keeps the input focused so its onBlur does not close
                      // the list before this click lands.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => add(option.value)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`block w-full px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                        option.kind === "custom" ? "border-t border-[#E5E7EB]" : ""
                      } ${active ? "bg-red-50 text-[#DC2626]" : "text-[#111827] hover:bg-[#F3F4F6]"}`}
                    >
                      {option.kind === "custom" ? (
                        <>
                          Use <span className="font-semibold">&ldquo;{option.value}&rdquo;</span> as diagnosis
                        </>
                      ) : (
                        option.value
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
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
        <p id={`${listboxId}-hint`} className="mt-1 text-[11px] font-medium text-[#DC2626]">
          {shownError}
        </p>
      )}
      {error && <p className="mt-1 text-[11px] font-medium text-[#DC2626]">{error}</p>}

      {diagnoses.length > 0 && (
        <ul aria-label="Added diagnoses" className="mt-2 flex flex-wrap gap-1.5">
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

      {pendingRemoval && (
        <div
          role="alert"
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border border-amber-300 bg-amber-50 px-3 py-2"
        >
          <p className="min-w-0 flex-1 text-xs leading-snug text-[#111827]">
            <span className="font-semibold">{pendingRemoval.item.name}</span> is the only diagnosis linked to{" "}
            {pendingRemoval.pathway.label}, which is already started. It will stay selected - turn it off in Programs
            &amp; Monitoring if it no longer applies.
          </p>
          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              onClick={() => setPendingRemoval(null)}
              className="h-7 px-2.5 text-xs font-semibold text-[#374151] hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(removeDiagnosis(diagnoses, pendingRemoval.item.id));
                setPendingRemoval(null);
              }}
              className="h-7 bg-[#DC2626] px-2.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Remove anyway
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
