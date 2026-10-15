import { X } from "lucide-react";

/**
 * Pieces shared by the medical conditions views and the consultation's
 * BackgroundEditor.
 */

const FIELD_LABEL_CLASS = "text-xs font-medium text-neutral-500";
const CONTROL_CLASS =
  "w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-800 shadow-xs outline-none transition focus:border-ink-300 focus:ring-4 focus:ring-ink-100";

export function GroupHeading({ children }) {
  return <p className={FIELD_LABEL_CLASS}>{children}</p>;
}

/** Marks a condition the consultation is following today (picked in Start Consultation). */
export function AddressedBadge() {
  return (
    <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[11px] font-medium text-ink-700 ring-1 ring-inset ring-ink-100">
      Addressed in this visit
    </span>
  );
}

/**
 * The Patient-Reported Previous Conditions in the editor: a name and an
 * optional note each, no status (only RHU confirms a condition).
 */
export function PatientReportedEdit({ diseases, onUpdate, onRemove }) {
  return (
    <div>
      <GroupHeading>Patient-Reported Previous Conditions</GroupHeading>
      <div className="mt-1.5 space-y-2">
        {diseases.length === 0 && <p className="text-[12px] text-neutral-400">None reported.</p>}
        {diseases.map((disease) => (
          <div key={`${disease.name}-${disease.index}`} className="rounded-lg border border-neutral-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] font-semibold text-neutral-900">{disease.name}</span>
              <button
                type="button"
                onClick={() => onRemove(disease.index)}
                aria-label={`Remove ${disease.name}`}
                className="text-neutral-400 transition hover:text-alert-600"
              >
                <X size={14} />
              </button>
            </div>
            <label className={`mt-2 block ${FIELD_LABEL_CLASS}`}>
              Note (optional)
              <input
                type="text"
                value={disease.note || ""}
                onChange={(event) => onUpdate(disease.index, "note", event.target.value)}
                className={`mt-1 font-normal normal-case tracking-normal ${CONTROL_CLASS}`}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Legacy consultation entries: shown for reference, never edited here. */
export function UnverifiedReadOnly({ title, diseases }) {
  if (diseases.length === 0) return null;
  return (
    <div>
      <GroupHeading>{title}</GroupHeading>
      <ul className="mt-1.5 space-y-1">
        {diseases.map((disease) => (
          <li
            key={`${disease.name}-${disease.index}`}
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12.5px] font-semibold text-neutral-900"
          >
            {disease.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BackgroundTextField({ label, value, placeholder, onChange }) {
  return (
    <label className={`block ${FIELD_LABEL_CLASS}`}>
      {label}
      <input
        type="text"
        value={value}
        placeholder={placeholder || "Not yet recorded"}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 font-normal normal-case tracking-normal ${CONTROL_CLASS}`}
      />
    </label>
  );
}
