import { X } from "lucide-react";

/**
 * Pieces shared by the read-only Patient Background tab and the consultation's
 * BackgroundEditor. Current Conditions are shown in the two groups from
 * docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md:
 * Monitored Conditions (registry-recognized) and Other Conditions (free-text).
 */

export const DISEASE_STATUS_OPTIONS = ["Active", "Controlled", "Resolved"];

const FIELD_LABEL_CLASS = "text-[11px] font-semibold uppercase tracking-wide text-gray-500";
const CONTROL_CLASS =
  "w-full rounded-none border border-gray-200 px-3 py-2 text-[12.5px] text-gray-700 outline-none transition focus:border-red-600";

export function GroupHeading({ children }) {
  return <p className={FIELD_LABEL_CLASS}>{children}</p>;
}

export function DiseaseGroupView({ title, diseases, emptyText }) {
  return (
    <div>
      <GroupHeading>{title}</GroupHeading>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {diseases.length ? (
          diseases.map((disease) => (
            <span
              key={`${disease.conditionKey || disease.name}-${disease.index}`}
              className="inline-flex items-center gap-1.5 rounded-none border border-gray-200 px-2 py-0.5 text-xs text-gray-800"
            >
              {disease.name}
              {disease.status ? ` · ${disease.status}` : ""}
            </span>
          ))
        ) : (
          <span className="text-sm text-gray-500">{emptyText}</span>
        )}
      </div>
    </div>
  );
}

export function DiseaseGroupEdit({ title, diseases, emptyText, onUpdate, onRemove }) {
  return (
    <div>
      <GroupHeading>{title}</GroupHeading>
      <div className="mt-1.5 space-y-2">
        {diseases.length === 0 && <p className="text-[12px] text-gray-400">{emptyText}</p>}
        {diseases.map((disease) => (
          <div
            key={`${disease.conditionKey || disease.name}-${disease.index}`}
            className="rounded-none border border-gray-200 bg-white p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] font-semibold text-gray-900">{disease.name}</span>
              <button
                type="button"
                onClick={() => onRemove(disease.index)}
                aria-label={`Remove ${disease.name}`}
                className="text-gray-400 transition hover:text-red-600"
              >
                <X size={14} />
              </button>
            </div>
            <div className="mt-2 grid gap-2 @xl:grid-cols-3">
              <label className={FIELD_LABEL_CLASS}>
                Status
                <select
                  value={disease.status || ""}
                  onChange={(event) => onUpdate(disease.index, "status", event.target.value)}
                  className="mt-1 w-full rounded-none border border-gray-200 px-2 py-1.5 text-[12px] font-normal normal-case tracking-normal text-gray-700 outline-none focus:border-red-600"
                >
                  <option value="">Select...</option>
                  {DISEASE_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className={FIELD_LABEL_CLASS}>
                First Recorded
                <input
                  type="date"
                  value={disease.firstRecorded || ""}
                  onChange={(event) => onUpdate(disease.index, "firstRecorded", event.target.value)}
                  className="mt-1 w-full rounded-none border border-gray-200 px-2 py-1.5 text-[12px] font-normal normal-case tracking-normal text-gray-700 outline-none focus:border-red-600"
                />
              </label>
              <label className={FIELD_LABEL_CLASS}>
                Last Confirmed
                <input
                  type="date"
                  value={disease.lastConfirmed || ""}
                  onChange={(event) => onUpdate(disease.index, "lastConfirmed", event.target.value)}
                  className="mt-1 w-full rounded-none border border-gray-200 px-2 py-1.5 text-[12px] font-normal normal-case tracking-normal text-gray-700 outline-none focus:border-red-600"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
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
