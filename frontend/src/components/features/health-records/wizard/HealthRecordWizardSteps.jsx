import {
  CalendarDays,
  Check,
  Clock,
} from "lucide-react";

import ButtonSpinner from "../../../common/loading/ButtonSpinner";

/**
 * Shared shell for every step of the consultation workspace.
 *
 * The "Visit Overview" strip is part of the shell rather than each step because
 * the date and time it shows are properties of the visit being recorded, not of
 * whichever step happens to be on screen.
 */
export function WizardCard({
  title,
  subtitle,
  visitDate,
  visitTime,
  showVisitOverview = true,
  unboxed = false,
  headerActions = null,
  backAction = null,
  children,
}) {
  return (
    <section className="anim-fade-up ml-0 mr-auto w-full max-w-6xl">
      <div className={unboxed ? "" : "rounded-xl border border-[#E8ECF0] bg-white px-5 py-5 shadow-sm sm:px-6"}>
        {backAction}
        {/* The step-based consultation carries its title above the card, so the
            heading here is optional; the Visit Overview strip stays either way. */}
        {(title || subtitle || showVisitOverview || headerActions) && (
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {title || subtitle ? (
          <div className="min-w-0">
            {title && (
              <h2 className="text-lg font-bold tracking-tight text-[#0F172A]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">
                {subtitle}
              </p>
            )}
          </div>
          ) : (
            <span />
          )}
          {(showVisitOverview || headerActions) && (
            <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:items-end">
              {showVisitOverview && (
                <div className="flex flex-none flex-wrap items-center gap-3.5">
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#94A3B8]">
                    Visit Overview
                  </span>
                  <span className="h-4 w-px bg-[#E2E8F0]" aria-hidden="true" />
                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={14} className="text-[#B91C1C]" />
                    <span className="text-[12.5px] font-bold text-[#0F172A]">
                      {visitDate}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} className="text-[#B91C1C]" />
                    <span className="text-[12.5px] font-bold text-[#0F172A]">
                      {visitTime}
                    </span>
                  </span>
                </div>
              )}
              {headerActions}
            </div>
          )}
        </div>
        )}
        {children}
      </div>
    </section>
  );
}

/**
 * One footer for every wizard screen: an optional Back on the left (or, where
 * the page-level Back already handles that, a subtle "Step n of N" line), and
 * the primary action on the right.
 */
export function WizardFooter({
  onBack,
  backLabel = "Back",
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
  nextBusy = false,
  // Shown INSTEAD of nextLabel while the action runs - never alongside it.
  busyLabel = "Loading...",
  helper = "",
  extra = null,
  align = "between",
}) {
  // The consultation workspace navigates from its own sticky action bar, so a
  // step that passes no actions gets no footer at all.
  if (!onBack && !onNext && !extra && !helper) return null;

  return (
    <div
      className={`mt-8 flex items-center gap-3 ${
        align === "between" ? "justify-between" : "justify-end"
      }`}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-2.5 text-[12.5px] font-semibold text-[#475569] transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
        >
          {backLabel}
        </button>
      ) : helper ? (
        <p className="hidden min-w-0 truncate text-[11px] font-medium text-[#94A3B8] sm:block">
          {helper}
        </p>
      ) : (
        <span />
      )}
      {(onNext || extra) && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {extra}
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled || nextBusy}
              aria-busy={nextBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {nextBusy ? (
                <>
                  <ButtonSpinner />
                  {busyLabel}
                </>
              ) : (
                nextLabel
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The six programs / services, grouped for scanning only. Grouping is visual:
 * it does not change what selecting one does, and nothing is ever selected on
 * the encoder's behalf from the diagnosis or vitals.
 */
const PROGRAM_GROUPS = [
  { key: "services", title: "Services", programs: ["Maternal", "Family Planning", "EPI"] },
  {
    key: "monitoring",
    title: "Condition Monitoring / Evaluation",
    programs: ["TB", "Hypertension", "Diabetes"],
  },
];

/**
 * Program / service selection at the end of Clinical Assessment. Optional:
 * selecting nothing is a general consultation. Cards, eligibility, and the
 * primary toggle are exactly the ones Current Visit used; only their grouping
 * is new.
 */
export function ProgramServicePicker({ programs, selected = [], primary, onSelect, onPrimaryChange, error }) {
  const grouped = new Set(PROGRAM_GROUPS.flatMap((group) => group.programs));
  // Anything not assigned a group is still offered - a program is never
  // silently hidden because the grouping list was not updated.
  const groups = [
    ...PROGRAM_GROUPS.map((group) => ({
      ...group,
      items: programs.filter((program) => group.programs.includes(program.key)),
    })),
    { key: "other", title: "Other", items: programs.filter((program) => !grouped.has(program.key)) },
  ].filter((group) => group.items.length > 0);

  return (
    <div data-field="healthRecordType" className="space-y-5">
      {groups.map((group) => (
        <div key={group.key}>
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
            {group.title}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((program) => {
              const Icon = program.icon;
              const active = selected.includes(program.key);
              return <div key={program.key} className={"relative rounded-xl border " + (active ? "border-red-600 bg-red-50" : "border-slate-200 bg-white")}>
                <button type="button" disabled={program.disabled} title={program.disabledReason} aria-pressed={active} onClick={() => onSelect(program.key)} className="flex h-full min-h-[112px] w-full flex-col items-start p-3 text-left disabled:cursor-not-allowed disabled:opacity-40">
                  <span className="mb-2 rounded-md border border-slate-200 bg-white p-1.5"><Icon size={15} className="text-red-700" /></span>
                  <span className="text-xs font-semibold text-slate-900">{program.title}</span>
                  <span className="mt-1 text-[11px] text-slate-500">{program.description}</span>
                  {program.disabled && <span className="mt-2 text-[10px] italic">Not applicable to this patient</span>}
                  {active && <Check size={14} className="absolute bottom-3 right-3 text-red-700" />}
                </button>
                {active && <button type="button" onClick={() => onPrimaryChange(program.key)} aria-label={"Make " + program.title + " primary"} className="absolute right-2 top-2 rounded border border-red-200 bg-white px-1.5 py-0.5 text-[9px] text-red-700">{primary === program.key ? "PRIMARY" : "Make primary"}</button>}
              </div>;
            })}
          </div>
        </div>
      ))}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

/**
 * Final step - the disposition, and the save.
 *
 * `NextActionSection` supplies the card grid and the conditional fields; this
 * wrapper only adds the wizard chrome and the primary action.
 */
export function NextActionStep({
  visitDate,
  visitTime,
  // Blank in the step-based consultation, where the page header above the card
  // already carries the title.
  title = "New Health Record",
  subtitle = "Set the patient and visit type to begin.",
  children,
  onBack,
  onSave,
  saving,
  saveLabel = "Save Record",
  savingLabel = "Saving...",
  helper = "",
  indicator = null,
}) {
  return (
    <WizardCard
      title={title}
      subtitle={subtitle}
      visitDate={visitDate}
      visitTime={visitTime}
    >
      {indicator}
      {!indicator && (
        <>
          <h3 className="text-[15px] font-bold text-[#0F172A]">Next Action</h3>
          <p className="mb-4 mt-0.5 text-[12.5px] text-[#64748B]">
            What should be done next?
          </p>
        </>
      )}

      {children}

      <WizardFooter
        onBack={onBack}
        onNext={onSave}
        nextLabel={saveLabel}
        nextBusy={saving}
        busyLabel={savingLabel}
        helper={helper}
      />
    </WizardCard>
  );
}

/**
 * Last step: a read-only recap of what the consultation will save, each block
 * with an Edit shortcut back to the step that owns it. It reads the page's
 * existing state - nothing here is a second copy of the data.
 */
export function ConsultationReviewStep({
  visitDate,
  visitTime,
  sections,
  errors = [],
  onEditStep,
  onSave,
  saving,
  saveLabel = "Save Record",
  savingLabel = "Saving...",
  helper = "",
  indicator = null,
}) {
  return (
    <WizardCard
      title={indicator ? "" : "Review & Save"}
      subtitle={
        indicator ? "" : "Confirm the consultation details below before saving."
      }
      visitDate={visitDate}
      visitTime={visitTime}
    >
      {indicator}
      {/* Save happens here, where the fields themselves are not on screen, so
          anything the checks or the server rejected is listed in one place. */}
      {errors.length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3"
        >
          <p className="text-[12.5px] font-bold text-[#B91C1C]">
            Please review before saving
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-[#B91C1C]">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-4">
        {sections.map((section) => (
          <section
            key={section.key}
            className="rounded-xl border border-[#E8ECF0] bg-white"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#F1F5F9] px-4 py-2.5">
              <h3 className="text-[13px] font-bold text-[#0F172A]">{section.title}</h3>
              {section.stepKey && (
                <button
                  type="button"
                  onClick={() => onEditStep(section.stepKey)}
                  className="text-[11.5px] font-semibold text-[#B91C1C] hover:text-[#991B1B]"
                >
                  Edit
                </button>
              )}
            </div>
            <dl className="divide-y divide-[#F1F5F9]">
              {section.rows.map(({ label, value }) => (
                <div
                  key={label}
                  className="grid gap-1 px-4 py-2.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"
                >
                  <dt className="text-[10.5px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    {label}
                  </dt>
                  <dd className="min-w-0 whitespace-pre-line break-words text-[12.5px] text-[#0F172A]">
                    {value || <span className="text-[#94A3B8]">Not recorded</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <WizardFooter
        onNext={onSave}
        nextLabel={saveLabel}
        nextBusy={saving}
        busyLabel={savingLabel}
        helper={helper}
      />
    </WizardCard>
  );
}
