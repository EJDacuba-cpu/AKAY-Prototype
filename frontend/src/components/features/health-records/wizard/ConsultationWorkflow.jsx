import { Users } from "lucide-react";

import ButtonSpinner from "../../../common/loading/ButtonSpinner";

/**
 * The New Consultation workspace (screen 2): header, sticky progress, the
 * two-column body with the patient snapshot, and the sticky action bar.
 *
 * "Completed" in the progress bar only means the user has moved past a step -
 * it is not a clinical sign-off - so it is derived purely from position.
 */

const EDGE = "-mx-3 px-3 sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5";

/**
 * Compact header. Patient context lives behind the Patient Summary drawer,
 * opened from here, so the form itself gets the full width.
 */
export function ConsultationWorkspaceHeader({ onOpenSummary }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-lg font-bold leading-tight tracking-tight text-[#0F172A]">
          New Consultation
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">
          Record the patient&apos;s clinical information, assessment, treatment,
          and next care decision for this visit.
        </p>
      </div>
      {onOpenSummary && (
        <button
          type="button"
          onClick={onOpenSummary}
          className="inline-flex flex-none items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#475569] shadow-sm transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
        >
          <Users size={14} />
          Patient Summary
        </button>
      )}
    </div>
  );
}

/**
 * Sticky bar across the consultation content. Autosave itself is silent and
 * never reports here; `secondaryAction` carries the manual Save Draft button,
 * placed beside the primary action.
 *
 * The negative margins pull it across the scroll container's own padding so
 * the white surface runs edge to edge and all the way to the bottom, leaving
 * no strip of page background showing through.
 */
export function ConsultationActionBar({
  onPrevious,
  previousDisabled = false,
  // The first screen has no previous STEP - it goes back out to setup - so the
  // caller names the destination instead of always saying "Previous".
  previousLabel = "Previous",
  secondaryAction = null,
  onContinue,
  continueLabel = "Next",
  continueBusy = false,
  continueBusyLabel = "Loading...",
  continueDisabled = false,
}) {
  return (
    <div
      className={`sticky bottom-[-12px] z-30 mt-5 -mb-3 border-t border-[#E8ECF0] bg-white pb-3 shadow-[0_-1px_3px_rgba(15,23,42,0.06)] sm:bottom-[-16px] sm:-mb-4 sm:pb-4 lg:bottom-[-20px] lg:-mb-5 lg:pb-5 ${EDGE}`}
    >
      <div className="flex h-16 items-center justify-between gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={previousDisabled}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-[#475569] transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#E5E7EB] disabled:hover:bg-white disabled:hover:text-[#475569]"
        >
          {previousLabel}
        </button>

        <div className="flex items-center gap-2">
          {secondaryAction}
          <button
            type="button"
            onClick={onContinue}
            disabled={continueBusy || continueDisabled}
            aria-busy={continueBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-5 py-2.5 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {continueBusy ? (
              <>
                <ButtonSpinner />
                {continueBusyLabel}
              </>
            ) : (
              continueLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The form takes the full width. The bottom padding is what keeps the last
 * fields clear of the sticky action bar while scrolling.
 */
export function ConsultationWorkspaceBody({ children }) {
  return <div className="min-w-0 pb-8">{children}</div>;
}

/**
 * Heading of the screen being filled in. No step counter and no progress bar:
 * the wizard still tracks position internally, it just is not displayed.
 */
export function ConsultationStepHeading({ title, subtitle = "" }) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-bold tracking-tight text-[#0F172A]">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">{subtitle}</p>
      )}
    </div>
  );
}
