/**
 * Barangay Health Services selection for a consultation, shown as a fixed
 * column to the right of the form. Optional: selecting nothing is a general
 * consultation.
 *
 * The services (Maternal Care, Family Planning, EPI) render as one flat list.
 * Conditions such as TB are not services here - they are monitored through the
 * Care Plan. Unchecking a service removes it - there is no separate Remove
 * action. "Primary" only means something when two or more services are
 * selected, so the badge and the "Make primary" control appear only then.
 */

const STATUS_STYLES = {
  Completed: "bg-[#DCFCE7] text-[#166534]",
  Incomplete: "bg-[#FEF3C7] text-[#92400E]",
  "Not Started": "bg-[#F3F4F6] text-[#374151]",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${
        STATUS_STYLES[status] || STATUS_STYLES["Not Started"]
      }`}
    >
      {status}
    </span>
  );
}

/**
 * @param programs        [{ key, title, description, disabled, disabledReason }]
 * @param selected        selected program keys
 * @param primary         the primary program key
 * @param statusByProgram { [programKey]: { status, stepKey } } for selected programs
 */
export default function ConsultationProgramPanel({
  programs,
  selected = [],
  primary,
  statusByProgram = {},
  onSelect,
  onPrimaryChange,
  onOpenForm,
  error,
}) {
  const multiple = selected.length >= 2;

  return (
    <aside
      aria-label="Barangay Health Services"
      data-field="healthRecordType"
      className="min-w-0 rounded-none border border-[#E5E7EB] bg-white lg:sticky lg:top-3 lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[#E5E7EB] px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[14px] font-bold leading-snug text-[#111827]">
            Barangay Health Services
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
            Select any service provided during this consultation. Leave unselected for a general consultation.
          </p>
        </div>
        <span className="mt-0.5 inline-flex min-w-[20px] flex-none items-center justify-center rounded-sm bg-[#F3F4F6] px-1.5 py-0.5 text-[11px] font-semibold text-[#374151]">
          {selected.length}
        </span>
      </div>

      <div>
        {programs.map((program) => {
          const active = selected.includes(program.key);
          const info = statusByProgram[program.key];
          const inputId = `program-panel-${program.key}`;
          return (
            <div
              key={program.key}
              className={`border-b border-[#E5E7EB] last:border-b-0 ${
                active ? "border-l-4 border-l-[#DC2626] bg-red-50" : "border-l-4 border-l-transparent"
              }`}
            >
              <label
                htmlFor={inputId}
                title={program.disabledReason}
                className={`flex items-start gap-2.5 px-3 py-2 ${
                  program.disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-[#F9FAFB]"
                }`}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={active}
                  disabled={program.disabled}
                  onChange={() => onSelect(program.key)}
                  className="mt-0.5 h-4 w-4 flex-none accent-[#DC2626]"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-snug text-[#111827]">
                    {program.title}
                  </span>
                  {program.description && (
                    <span className="mt-0.5 block text-xs leading-snug text-[#6B7280]">
                      {program.description}
                    </span>
                  )}
                  {program.disabled && (
                    <span className="mt-1 block text-[11px] italic text-[#6B7280]">
                      Not applicable to this patient
                    </span>
                  )}
                </span>
              </label>

              {active && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 pl-[38px] pr-3">
                  {info && <StatusBadge status={info.status} />}
                  {multiple && (primary === program.key ? (
                    <span className="rounded-sm border border-red-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#DC2626]">
                      Primary
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPrimaryChange(program.key)}
                      aria-label={`Make ${program.title} primary`}
                      className="text-[11px] font-semibold text-[#6B7280] hover:text-[#111827]"
                    >
                      Make primary
                    </button>
                  ))}
                  {info?.stepKey && (
                    <button
                      type="button"
                      onClick={() => onOpenForm(info.stepKey)}
                      className="ml-auto text-[12px] font-semibold text-[#DC2626] hover:text-red-700"
                    >
                      Open form
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="border-t border-[#E5E7EB] px-4 py-2 text-[12px] font-medium text-[#DC2626]">
          {error}
        </p>
      )}
    </aside>
  );
}
