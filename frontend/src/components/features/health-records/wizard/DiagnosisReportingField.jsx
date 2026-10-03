import { REPORT_AS_OPTIONS, normalizeReportAs } from "../../../../utils/diagnosisReporting";

/**
 * One condition's reporting controls, shown inside that condition's Care Plan
 * row. Two independent choices - the report (Not reported, Morbidity, or
 * Notifiable; see utils/diagnosisReporting.js) and an "Include in Surveillance"
 * checkbox that puts it in the Surveillance Report (utils/surveillance.js).
 * The worker picks; nothing is inferred from the diagnosis name. Condition-level
 * only: the visit itself is counted from its own record, never from these.
 *
 * @param diagnosis             { id, name, reportAs, includeInSurveillance }
 * @param onChange              (id, reportAs) => void
 * @param onSurveillanceChange  (id, boolean) => void
 */
export default function DiagnosisReportingField({ diagnosis, onChange, onSurveillanceChange }) {
  const selected = normalizeReportAs(diagnosis.reportAs);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="text-xs font-medium text-[#6B7280]">Report as</span>
      {REPORT_AS_OPTIONS.map((option) => {
        const checked = selected === option.value;
        return (
          <label key={option.label} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
            <input
              type="radio"
              name={`report-as-${diagnosis.id}`}
              checked={checked}
              onChange={() => onChange(diagnosis.id, option.value)}
              className="h-4 w-4 accent-[#DC2626]"
            />
            <span className={checked && option.value ? "font-semibold text-[#DC2626]" : "text-gray-600"}>
              {option.label}
            </span>
          </label>
        );
      })}
      <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
        <input
          type="checkbox"
          checked={diagnosis.includeInSurveillance === true}
          onChange={(event) => onSurveillanceChange(diagnosis.id, event.target.checked)}
          className="h-4 w-4 accent-[#DC2626]"
        />
        <span className={diagnosis.includeInSurveillance ? "font-semibold text-[#DC2626]" : "text-gray-600"}>
          Include in Surveillance
        </span>
      </label>
    </div>
  );
}
