import { useId } from "react";
import { CheckCircle2 } from "lucide-react";
import ModalShell, { ModalButton } from "./ModalShell";

// Variants a caller may opt into. Anything else falls back to "secondary".
// "ghost" is allowed so a third action can sit below the outline secondaries
// instead of competing with them for attention.
const ALLOWED_VARIANTS = new Set(["primary", "destructive", "ghost"]);

// No exit animation by design. It would require keeping the panel mounted after
// open=false, but most callers unmount this outright (AddUser renders it behind
// `{successModal && ...}`) or navigate away in onClose (AddHealthRecord,
// AddPatient). The animation would rarely be seen, while delaying unmount would
// shift ModalShell's focus-return and scroll-lock timing for every consumer.
export default function SuccessModal({
  open,
  title,
  description,
  actions,
  buttonText = "Continue",
  onClose,
  secondaryButtonText,
  onSecondaryAction,
}) {
  const descriptionId = useId();
  if (!open) return null;

  const hasCustomActions = Array.isArray(actions) && actions.length > 0;
  // Primary renders last so it sits rightmost on desktop and closest to the
  // thumb once the footer stacks on mobile.
  const orderedActions = hasCustomActions
    ? [
        ...actions.filter((action) => action.variant !== "primary"),
        ...actions.filter((action) => action.variant === "primary"),
      ]
    : [];

  // Guarantee exactly one filled button. ModalButton renders "primary" and
  // "destructive" identically, so a caller passing both would put two filled
  // reds side by side; every filled variant after the first is demoted to the
  // outline treatment.
  let filledClaimed = false;
  const resolvedActions = orderedActions.map((action) => {
    const requested = ALLOWED_VARIANTS.has(action.variant)
      ? action.variant
      : "secondary";
    const wantsFill = requested === "primary" || requested === "destructive";
    if (!wantsFill) return { ...action, resolvedVariant: requested };
    if (filledClaimed) return { ...action, resolvedVariant: "secondary" };
    filledClaimed = true;
    return { ...action, resolvedVariant: requested };
  });

  // w-full is what stacks the footer. ModalFooter's inner row is flex-wrap, so
  // a 100%-wide item fills its line and pushes the next onto a new one. Done
  // here rather than in ModalFooter because that footer is shared with
  // non-button content (MedicineInventoryHistoryModal paginates with it).
  //
  // Three actions never fit one row at this width, and three similarly-weighted
  // buttons wrapping mid-row is the "competing actions" problem itself — so at
  // 3+ they stay stacked at every breakpoint, giving one unambiguous scan order
  // that ends on the filled primary. Two or fewer return to an inline row at sm.
  const stackAlways = orderedActions.length > 2;
  const widthClass = stackAlways ? "w-full" : "w-full sm:w-auto";

  const footer = hasCustomActions ? (
    resolvedActions.map((action) => (
      <ModalButton
        key={action.label}
        variant={action.resolvedVariant}
        primary={action.resolvedVariant === "primary"}
        disabled={action.disabled}
        onClick={action.onClick}
        className={widthClass}
      >
        {action.icon}
        {action.label}
      </ModalButton>
    ))
  ) : (
    <>
      {secondaryButtonText && onSecondaryAction && (
        <ModalButton onClick={onSecondaryAction} className="w-full sm:w-auto">
          {secondaryButtonText}
        </ModalButton>
      )}
      <ModalButton
        variant="primary"
        primary
        onClick={onClose}
        className="w-full sm:w-auto"
      >
        {buttonText}
      </ModalButton>
    </>
  );

  return (
    <ModalShell
      open={open}
      title={title}
      // md, not sm: at max-w-sm even two buttons of ordinary label length wrap
      // onto separate rows, which reads as a layout bug rather than hierarchy.
      size="md"
      onClose={onClose}
      ariaDescribedBy={description ? descriptionId : undefined}
      footer={footer}
    >
      <div className="flex flex-col items-center gap-4 py-1 text-center">
        {/* Decorative: the message below carries the meaning for screen readers. */}
        <span
          aria-hidden="true"
          className="anim-success-badge motion-reduce:animate-none flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-500 ring-8 ring-success-50/60"
        >
          <CheckCircle2
            size={26}
            strokeWidth={2.2}
            className="anim-success-check motion-reduce:animate-none"
          />
        </span>
        {description && (
          <p
            id={descriptionId}
            role="status"
            aria-live="polite"
            className="text-[13px] leading-5 text-slate-600"
          >
            {description}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
