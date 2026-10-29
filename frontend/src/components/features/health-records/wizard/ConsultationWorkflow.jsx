import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "../../../ui/button";
import ButtonSpinner from "../../../common/loading/ButtonSpinner";

/**
 * Consultation body and persistent action bar. Shared buttons keep navigation,
 * draft actions and busy states consistent across consultation screens.
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
  // Optional, beside Previous (the BHC Patient History reference), so it
  // stays reachable on every step without scrolling.
  leadingAction = null,
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
      <div className="consultation-actions flex min-h-14 flex-wrap items-center justify-between gap-3 py-2">
        <div className="consultation-actions__leading flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={onPrevious} disabled={previousDisabled} className="consultation-actions__previous">
            <ArrowLeft size={14} aria-hidden="true" />
            {previousLabel}
          </Button>
          {leadingAction}
        </div>
        <div className="consultation-actions__trailing ml-auto flex flex-wrap items-center justify-end gap-2">
          {secondaryAction}
          <Button type="button" variant="brand" onClick={onContinue} disabled={continueBusy || continueDisabled} aria-busy={continueBusy} className="consultation-actions__continue">
            {continueBusy ? (
              <><ButtonSpinner />{continueBusyLabel}</>
            ) : (
              <>{continueLabel}<ArrowRight size={14} aria-hidden="true" /></>
            )}
          </Button>
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
