import {
  CalendarDays,
  Clock,
} from "lucide-react";

import ButtonSpinner from "../../../common/loading/ButtonSpinner";

/**
 * Shared shell for every step of the consultation workspace.
 *
 * The "Visit Overview" strip is part of the shell rather than each step because
 * the date and time it shows are properties of the visit being recorded, not of
 * whichever step happens to be on screen.
 *
 * Styled to the EHR minimalism system: sharp corners, 1px borders, no shadows,
 * red (#DC2626) only for the primary action and the active/selected state.
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
      <div className={unboxed ? "" : "rounded-none border border-[#E5E7EB] bg-white p-4 sm:p-5"}>
        {backAction}
        {/* The step-based consultation carries its title above the card, so the
            heading here is optional; the Visit Overview strip stays either way. */}
        {(title || subtitle || showVisitOverview || headerActions) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {title || subtitle ? (
          <div className="min-w-0">
            {title && (
              <h2 className="text-lg font-bold leading-snug tracking-tight text-[#111827]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[13px] leading-relaxed text-[#374151]">
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
                <div className="flex flex-none flex-wrap items-center gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                    Visit Overview
                  </span>
                  <span className="h-4 w-px bg-[#D1D5DB]" aria-hidden="true" />
                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={14} className="text-[#DC2626]" />
                    <span className="text-[13px] font-semibold text-[#111827]">
                      {visitDate}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} className="text-[#DC2626]" />
                    <span className="text-[13px] font-semibold text-[#111827]">
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
      className={`mt-6 flex items-center gap-3 ${
        align === "between" ? "justify-between" : "justify-end"
      }`}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="rounded-none border border-[#D1D5DB] bg-white px-4 py-2 text-[13px] font-semibold leading-tight text-[#111827] transition-colors duration-150 hover:bg-[#F9FAFB] active:bg-[#F3F4F6]"
        >
          {backLabel}
        </button>
      ) : helper ? (
        <p className="hidden min-w-0 truncate text-[12px] text-[#6B7280] sm:block">
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
              className="inline-flex items-center justify-center gap-2 rounded-none bg-[#DC2626] px-4 py-2 text-[13px] font-semibold leading-tight text-white transition-colors duration-150 hover:bg-[#B91C1C] active:bg-[#991B1B] disabled:cursor-not-allowed disabled:bg-[#D1D5DB] disabled:text-[#6B7280]"
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
          <h3 className="text-[15px] font-semibold text-[#111827]">Next Action</h3>
          <p className="mb-4 mt-0.5 text-[13px] text-[#374151]">
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
      unboxed
      title={indicator ? "" : "Review & Confirm"}
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
          className="mb-4 rounded-none border border-[#FECACA] border-l-4 border-l-[#DC2626] bg-[#FEF2F2] p-4"
        >
          <p className="text-[13px] font-bold text-[#991B1B]">
            Please review before saving
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-[#991B1B]">
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
            className="rounded-none border border-[#E5E7EB] bg-white"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#111827]">{section.title}</h3>
              {section.stepKey && (
                <button
                  type="button"
                  onClick={() => onEditStep(section.stepKey)}
                  className="text-[12px] font-semibold text-[#DC2626] hover:text-[#991B1B]"
                >
                  Edit
                </button>
              )}
            </div>
            <dl className="divide-y divide-[#E5E7EB]">
              {section.rows.map(({ label, value }) => (
                <div
                  key={label}
                  className="grid gap-1 px-4 py-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"
                >
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                    {label}
                  </dt>
                  <dd className="min-w-0 whitespace-pre-line break-words text-[13px] text-[#111827]">
                    {value || <span className="text-[#9CA3AF]">Not recorded</span>}
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
