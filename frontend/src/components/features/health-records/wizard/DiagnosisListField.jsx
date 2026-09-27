import { useLayoutEffect, useRef, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { CONDITION_STATUSES, DIAGNOSIS_LIMITS, createDiagnosisId } from "../../../../utils/diagnoses";

/**
 * Diagnosis / Clinical Impression for the Assessment step: a compact list of
 * diagnoses and one "+ Add Diagnosis" button. Each diagnosis is typed by the
 * user - nothing is suggested, searched or inferred - and only those ticked
 * "Add to Current Conditions" are added to the patient's profile, when the
 * consultation is saved.
 *
 * Add and Edit use one small native modal <dialog>: centred from 1024px, a
 * bottom sheet below that.
 */

const LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]";
const INPUT_CLASS =
  "h-9 w-full rounded-none border border-[#D1D5DB] bg-white px-3 text-sm text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] focus:border-[#DC2626] focus:ring-2 focus:ring-red-200";

function DiagnosisDialog({ initial, canAddToConditions, onSave, onClose }) {
  const dialogRef = useRef(null);
  const nameInputRef = useRef(null);
  const [name, setName] = useState(initial?.name || "");
  const [addToConditions, setAddToConditions] = useState(Boolean(initial?.addToConditions));
  const [conditionStatus, setConditionStatus] = useState(initial?.conditionStatus || "Active");
  const editing = Boolean(initial);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      nameInputRef.current?.focus();
    }
  }, []);

  function save() {
    const text = name.trim();
    if (!text) {
      nameInputRef.current?.focus();
      return;
    }
    const withConditions = canAddToConditions ? addToConditions : Boolean(initial?.addToConditions);
    onSave({
      id: initial?.id || createDiagnosisId(),
      name: text,
      addToConditions: withConditions,
      conditionStatus: withConditions ? (canAddToConditions ? conditionStatus : initial?.conditionStatus || "Active") : null,
    });
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="diagnosis-dialog-title"
      onClose={onClose}
      // Light dismiss: a click landing on the dialog element itself (not its
      // content) is a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-none border border-[#E5E7EB] bg-white p-0 text-[#111827] shadow-lg backdrop:bg-black/30 lg:m-auto lg:w-[400px] lg:max-w-[calc(100%-2rem)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] px-4 py-2.5">
        <h2 id="diagnosis-dialog-title" className="text-[14px] font-bold leading-snug">
          {editing ? "Edit Diagnosis" : "Add Diagnosis"}
        </h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close"
          className="flex h-8 w-8 flex-none items-center justify-center text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-3 px-4 py-3">
        <label className="block">
          <span className={LABEL_CLASS}>
            Diagnosis / Clinical Impression <span className="text-red-500">*</span>
          </span>
          <input
            ref={nameInputRef}
            value={name}
            maxLength={DIAGNOSIS_LIMITS.name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
            }}
            className={INPUT_CLASS}
          />
        </label>

        {canAddToConditions && (
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#111827]">
              <input
                type="checkbox"
                checked={addToConditions}
                onChange={(event) => setAddToConditions(event.target.checked)}
                className="h-4 w-4 flex-none accent-[#DC2626]"
              />
              Add to Current Conditions
            </label>
            {addToConditions && (
              <label className="block">
                <span className={LABEL_CLASS}>Status</span>
                <select
                  value={conditionStatus}
                  onChange={(event) => setConditionStatus(event.target.value)}
                  className={INPUT_CLASS}
                >
                  {CONDITION_STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="h-9 px-3 text-sm font-semibold text-[#374151] hover:bg-[#F3F4F6]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!name.trim()}
            className="h-9 bg-[#DC2626] px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {editing ? "Save changes" : "Save diagnosis"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * @param diagnoses          [{ id, name, addToConditions, conditionStatus }]
 * @param onChange           receives the next list
 * @param canAddToConditions user may update Current Conditions (clinical.history)
 * @param error              validation message for the diagnosis
 */
export default function DiagnosisListField({ diagnoses = [], onChange, canAddToConditions = false, error }) {
  // null = closed, "new" = adding, otherwise the diagnosis being edited.
  const [dialog, setDialog] = useState(null);
  const addButtonRef = useRef(null);
  const full = diagnoses.length >= DIAGNOSIS_LIMITS.count;

  function handleSave(item) {
    if (diagnoses.some((entry) => entry.id === item.id)) {
      onChange(diagnoses.map((entry) => (entry.id === item.id ? item : entry)));
    } else if (!full) {
      onChange([...diagnoses, item]);
    }
  }

  return (
    <div>
      <p className={LABEL_CLASS}>Diagnosis / Clinical Impression</p>

      {diagnoses.length > 0 ? (
        <ul className={`divide-y divide-[#E5E7EB] border ${error ? "border-[#DC2626]" : "border-[#E5E7EB]"}`}>
          {diagnoses.map((item) => (
            <li key={item.id} className="flex items-start gap-1 py-2 pl-3 pr-2">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold leading-snug text-[#111827]">{item.name}</p>
                {item.addToConditions && (
                  <span className="mt-1 inline-flex items-center rounded-sm border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-[#DC2626]">
                    Added to Current Conditions · {item.conditionStatus}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDialog(item)}
                aria-label={`Edit ${item.name}`}
                className="flex h-7 w-7 flex-none items-center justify-center text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]"
              >
                <Pencil size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onChange(diagnoses.filter((entry) => entry.id !== item.id))}
                aria-label={`Remove ${item.name}`}
                className="flex h-7 w-7 flex-none items-center justify-center text-[#6B7280] hover:bg-red-50 hover:text-[#DC2626]"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`border px-3 py-2 text-sm text-[#6B7280] ${error ? "border-[#DC2626]" : "border-[#E5E7EB]"}`}>
          No diagnosis added.
        </p>
      )}

      {error && <p className="mt-1 text-[11px] font-medium text-[#DC2626]">{error}</p>}

      <button
        ref={addButtonRef}
        type="button"
        onClick={() => setDialog("new")}
        disabled={full}
        className="mt-3 inline-flex items-center gap-1.5 rounded-none border border-dashed border-[#D1D5DB] px-3 py-1.5 text-xs font-semibold text-[#374151] transition-colors hover:border-[#DC2626] hover:text-[#DC2626] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={14} aria-hidden="true" />
        Add Diagnosis
      </button>

      {dialog && (
        <DiagnosisDialog
          key={dialog === "new" ? "new" : dialog.id}
          initial={dialog === "new" ? null : dialog}
          canAddToConditions={canAddToConditions}
          onSave={handleSave}
          onClose={() => {
            setDialog(null);
            addButtonRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
  );
}
