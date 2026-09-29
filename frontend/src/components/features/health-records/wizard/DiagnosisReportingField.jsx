import { REPORT_AS_OPTIONS, normalizeReportAs } from "../../../../utils/diagnosisReporting";

/**
 * Morbidity / Notifiable reporting under Records & Surveillance: one row per
 * diagnosis, each with a single choice - Not reported, Morbidity, or
 * Notifiable (see utils/diagnosisReporting.js). The worker picks; nothing is
 * inferred from the diagnosis name.
 *
 * Rows are plain { id, name, reportAs } so the caller decides what they are:
 * the Assessment step passes its diagnosis list, and the follow-up form
 * (free-text assessment, no list) passes one row for the whole visit.
 *
 * @param rows        [{ id, name, reportAs }]
 * @param onChange    (id, reportAs) => void
 * @param emptyText   shown when there is nothing to report yet
 */
export default function DiagnosisReportingField({ rows = [], onChange, emptyText }) {
  if (rows.length === 0) {
    return <p className="text-xs text-gray-400">{emptyText}</p>;
  }

  return (
    <ul className="divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
      {rows.map((row) => {
        const selected = normalizeReportAs(row.reportAs);
        return (
          <li key={row.id}>
            <fieldset className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <legend className="float-left min-w-0 break-words text-sm font-semibold text-[#111827]">
                {row.name}
              </legend>
              <div className="flex flex-none flex-wrap gap-x-4 gap-y-1.5">
                {REPORT_AS_OPTIONS.map((option) => {
                  const checked = selected === option.value;
                  return (
                    <label key={option.label} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                      <input
                        type="radio"
                        name={`report-as-${row.id}`}
                        checked={checked}
                        onChange={() => onChange(row.id, option.value)}
                        className="h-4 w-4 accent-[#DC2626]"
                      />
                      <span className={checked && option.value ? "font-semibold text-[#DC2626]" : "text-gray-600"}>
                        {option.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </li>
        );
      })}
    </ul>
  );
}
