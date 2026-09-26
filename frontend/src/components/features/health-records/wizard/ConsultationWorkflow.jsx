import ButtonSpinner from "../../../common/loading/ButtonSpinner";

/**
 * The New Consultation workspace: the body and the sticky action bar. Styled to the EHR minimalism system - sharp corners, 1px borders instead
 * of shadows, one red (#DC2626) reserved for the primary action.
 *
 * "Completed" in the progress bar only means the user has moved past a step -
 * it is not a clinical sign-off - so it is derived purely from position.
 */

const EDGE = "-mx-3 px-3 sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5";

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
  // The first screen has no previous step; it returns to the launching patient
  // or follow-up context, so the caller names that destination.
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
      className={`ehr-consult__actionbar sticky bottom-[-12px] z-30 mt-5 -mb-3 border-t border-[#D1D5DB] bg-white pb-3 sm:bottom-[-16px] sm:-mb-4 sm:pb-4 lg:bottom-[-20px] lg:-mb-5 lg:pb-5 ${EDGE}`}
    >
      <div className="flex h-14 items-center justify-between gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={previousDisabled}
          className="inline-flex items-center gap-1.5 rounded-none border border-[#D1D5DB] bg-white px-4 py-2 text-[13px] font-semibold leading-tight text-[#111827] transition-colors duration-150 hover:bg-[#F9FAFB] active:bg-[#F3F4F6] disabled:cursor-not-allowed disabled:border-[#E5E7EB] disabled:text-[#9CA3AF] disabled:hover:bg-white"
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
            className="inline-flex items-center justify-center gap-2 rounded-none bg-[#DC2626] px-4 py-2 text-[13px] font-semibold leading-tight text-white transition-colors duration-150 hover:bg-red-700 active:bg-red-800 disabled:cursor-not-allowed disabled:bg-[#D1D5DB] disabled:text-[#6B7280]"
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
  return <div className="ehr-consult__body min-w-0 pb-8">{children}</div>;
}

/**
 * Heading of the screen being filled in. No step counter and no progress bar:
 * the wizard still tracks position internally, it just is not displayed.
 */
export function ConsultationStepHeading({ title, subtitle = "", className = "mb-4" }) {
  return (
    <div className={className}>
      <h2 className="text-lg font-bold leading-snug tracking-tight text-[#111827]">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-0.5 text-[13px] leading-relaxed text-[#374151]">
          {subtitle}
        </p>
      )}
    </div>
  );
}
