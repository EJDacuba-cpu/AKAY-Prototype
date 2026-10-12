import { programEnrollLabel } from "../../../../utils/consultationPrograms";

/**
 * Barangay Health Services for a consultation, shown as a fixed column to the
 * right of the form. Optional: enrolling in nothing is a general consultation.
 *
 * The services (Maternal Care, Family Planning, EPI) render as one flat list.
 * Each starts "Not Started" with an Enroll button; enrolling turns it Active
 * for this visit, and Remove puts it back. The service's form is a screen of
 * its own after Physical Examination, so the panel has no form button.
 * Conditions such as TB are not services here - they are monitored through the
 * Care Plan. "Primary" only means something when two or more services are
 * Active, so the badge and the "Make primary" control appear only then.
 */

/**
 * @param programs  [{ key, title, description, disabled, disabledReason, disabledNote }]
 * @param selected  Active program keys
 * @param primary   the primary program key
 * @param onSelect  enrolls the service, or removes it when it is Active
 */
export default function ConsultationProgramPanel({
  programs,
  selected = [],
  primary,
  onSelect,
  onPrimaryChange,
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
            Enroll the patient in any service provided during this consultation. Leave all as Not Started for a general consultation.
          </p>
        </div>
        <span className="mt-0.5 inline-flex min-w-[20px] flex-none items-center justify-center rounded-sm bg-[#F3F4F6] px-1.5 py-0.5 text-[11px] font-semibold text-[#374151]">
          {selected.length}
        </span>
      </div>

      <div>
        {programs.map((program) => {
          const active = selected.includes(program.key);
          return (
            <div
              key={program.key}
              className={`border-b border-[#E5E7EB] px-3 py-2 transition-colors duration-300 motion-reduce:transition-none last:border-b-0 ${
                active ? "border-l-4 border-l-[#DC2626] bg-red-50" : "border-l-4 border-l-transparent"
              }`}
            >
              <p className="text-[13px] font-semibold leading-snug text-[#111827]">
                {program.title}
              </p>
              {program.description && (
                <p className="mt-0.5 text-xs leading-snug text-[#6B7280]">
                  {program.description}
                </p>
              )}
              {program.disabled && (
                <p className="mt-1 text-[11px] italic text-[#6B7280]">
                  {program.disabledNote || "Not applicable to this patient"}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-semibold transition-colors duration-300 motion-reduce:transition-none ${
                    active ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#F3F4F6] text-[#374151]"
                  }`}
                >
                  {active ? "Active" : "Not Started"}
                </span>
                {active && (
                  <button
                    type="button"
                    onClick={() => onSelect(program.key)}
                    aria-label={`Remove ${program.title}`}
                    className="text-[11px] font-semibold text-[#6B7280] hover:text-[#111827]"
                  >
                    Remove
                  </button>
                )}
                {active && multiple && (primary === program.key ? (
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
              </div>

              {!active && (
                <button
                  type="button"
                  disabled={program.disabled}
                  title={program.disabledReason}
                  onClick={() => onSelect(program.key)}
                  className="mt-2 w-full rounded-none border border-[#DC2626] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#DC2626] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
                >
                  {programEnrollLabel(program.key)}
                </button>
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
