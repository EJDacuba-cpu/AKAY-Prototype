import { FieldError, FieldInput } from "../fields/ClinicalFields";
import { DIAGNOSIS_LIMITS } from "../../../../utils/diagnoses";
import {
  REPORT_DESTINATIONS,
  entryDestinations,
  newReportingEntry,
  toggleDestination,
} from "../../../../utils/reportingEntries";

const DESTINATION_LABELS = Object.freeze({
  morbidity: "Morbidity Report",
  notifiable: "Notifiable Disease Report",
  surveillance: "Community-Based Surveillance",
});

/**
 * Reporting (optional) on Medication, Treatment & Next Steps: the health
 * problems this visit is reported under, each with the reports it goes to.
 * Reporting only - an entry never schedules a follow-up, refers, or creates a
 * condition. The name is typed by the worker: no suggestions, never prefilled.
 * Rules and messages live in utils/reportingEntries.js.
 *
 * @param entries   [{ id, name, reportIn[] }]
 * @param errors    validation errors keyed `reportingEntry.<id>.<name|reportIn|duplicate>`
 * @param onChange  (entries) => void
 */
export default function ReportingEntriesField({ entries = [], errors = {}, disabled = false, onChange }) {
  const full = entries.length >= DIAGNOSIS_LIMITS.count;
  const update = (id, change) => onChange(entries.map((entry) => (entry.id === id ? change(entry) : entry)));

  return (
    <section aria-labelledby="reporting-entries-heading">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="reporting-entries-heading" className="text-sm font-bold text-[#111827]">Reporting (optional)</h2>
        <button
          type="button"
          disabled={disabled || full}
          title={full ? `Up to ${DIAGNOSIS_LIMITS.count} entries per visit.` : undefined}
          onClick={() => onChange([...entries, newReportingEntry()])}
          className="text-[13px] font-semibold text-[#DC2626] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          + Add entry
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="mt-1 text-[13px] text-[#6B7280]">Not reported for this visit.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
          {entries.map((entry) => {
            const nameKey = `reportingEntry.${entry.id}.name`;
            const duplicateKey = `reportingEntry.${entry.id}.duplicate`;
            const reportInKey = `reportingEntry.${entry.id}.reportIn`;
            const chosen = entryDestinations(entry);
            const groupId = `reporting-entry-${entry.id}-reports`;
            return (
              <li key={entry.id} className="py-3">
                <fieldset disabled={disabled} className="min-w-0 space-y-2">
                  <div className="flex items-start gap-3">
                    <FieldInput
                      wrapperClassName="min-w-0 flex-1"
                      label="Reported Health Problem / Suspected Case"
                      required
                      name={nameKey}
                      data-field={duplicateKey}
                      value={entry.name || ""}
                      error={errors[nameKey] || errors[duplicateKey]}
                      maxLength={150}
                      autoComplete="off"
                      onChange={(event) => update(entry.id, (current) => ({ ...current, name: event.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}
                      aria-label={`Remove ${String(entry.name || "").trim() || "this entry"}`}
                      className="mt-7 shrink-0 text-xs font-medium text-[#6B7280] underline-offset-2 hover:text-[#B91C1C] hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <div role="group" aria-labelledby={groupId} aria-invalid={Boolean(errors[reportInKey])}>
                    <p id={groupId} className="sr-only">Report in</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {REPORT_DESTINATIONS.map((destination, index) => {
                        const checked = chosen.includes(destination);
                        return (
                          <label key={destination} className="inline-flex cursor-pointer items-center gap-1.5 text-[13px]">
                            <input
                              type="checkbox"
                              // The first box takes focus when no report was chosen.
                              data-field={index === 0 ? reportInKey : undefined}
                              checked={checked}
                              onChange={(event) =>
                                update(entry.id, (current) => toggleDestination(current, destination, event.target.checked))
                              }
                              className="h-4 w-4 accent-[#DC2626]"
                            />
                            <span className={checked ? "font-semibold text-[#111827]" : "text-[#374151]"}>
                              {DESTINATION_LABELS[destination]}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <FieldError error={errors[reportInKey]} />
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
