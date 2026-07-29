import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-xl",
  xl: "max-w-2xl",
  "2xl": "max-w-3xl",
  wide: "max-w-6xl",
};

export default function ModalShell({
  open = true,
  title,
  subtitle,
  icon,
  size = "md",
  children,
  footer,
  footerLeading,
  onClose,
  closeDisabled = false,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  initialFocusRef,
  bodyClassName = "",
  panelClassName = "",
  overlayClassName = "",
  ariaDescribedBy,
  hideClose = false,
  printHidden = false,
}) {
  const generatedTitleId = useId();
  const generatedDescriptionId = useId();
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = title ? generatedTitleId : undefined;
  const descriptionId =
    ariaDescribedBy || (subtitle ? generatedDescriptionId : undefined);
  const canDismiss = Boolean(onClose && !closeDisabled);
  const closeHandlerRef = useRef(onClose);
  const dismissOptionsRef = useRef({
    canDismiss,
    dismissOnEscape,
  });

  useEffect(() => {
    closeHandlerRef.current = onClose;
    dismissOptionsRef.current = {
      canDismiss,
      dismissOnEscape,
    };
  }, [canDismiss, dismissOnEscape, onClose]);

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      const requestedTarget = initialFocusRef?.current;
      const fallbackTarget =
        panelRef.current?.querySelector("[data-modal-primary]:not(:disabled)") ||
        panelRef.current?.querySelector(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
        ) ||
        panelRef.current;
      (requestedTarget || fallbackTarget)?.focus?.();
    });

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (
          dismissOptionsRef.current.dismissOnEscape &&
          dismissOptionsRef.current.canDismiss
        ) {
          event.preventDefault();
          closeHandlerRef.current?.();
        }
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((element) => element.getClientRects().length > 0);

      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [initialFocusRef, open]);

  if (!open) return null;

  function handleBackdrop(event) {
    if (
      event.target === event.currentTarget &&
      dismissOnBackdrop &&
      canDismiss
    ) {
      onClose();
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px] anim-overlay motion-reduce:animate-none sm:p-5 ${
        printHidden ? "print:hidden" : ""
      } ${overlayClassName}`}
      onMouseDown={handleBackdrop}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`anim-content-in relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15 motion-reduce:animate-none sm:max-h-[calc(100dvh-2.5rem)] ${
          sizeClasses[size] || sizeClasses.md
        } ${panelClassName}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-3 bg-[#B91C1C] px-5 py-3.5 text-white">
          {icon && (
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/15 text-white">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1 pr-7">
            {title && (
              <h2
                id={titleId}
                className="font-sans text-sm font-semibold leading-5 text-white"
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                id={ariaDescribedBy ? undefined : generatedDescriptionId}
                className="mt-0.5 text-xs leading-4 text-white/85"
              >
                {subtitle}
              </p>
            )}
          </div>
          {!hideClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={closeDisabled}
              aria-label="Close modal"
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-white/80 transition hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40 disabled:pointer-events-none disabled:opacity-40"
            >
              <X size={15} strokeWidth={2.2} />
            </button>
          )}
        </header>

        <div
          className={`min-h-0 flex-1 overflow-y-auto px-5 py-5 text-[13px] leading-5 text-slate-600 ${bodyClassName}`}
        >
          {children}
        </div>

        {footer !== undefined && footer !== null && (
          <ModalFooter leading={footerLeading}>{footer}</ModalFooter>
        )}
      </section>
    </div>
  );
}

export function ModalFooter({ leading, children, className = "" }) {
  return (
    <footer
      className={`flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-5 py-3.5 sm:flex-row sm:items-center ${
        leading ? "sm:justify-between" : "sm:justify-end"
      } ${className}`}
    >
      {leading && <div className="min-w-0 text-xs text-slate-500">{leading}</div>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {children}
      </div>
    </footer>
  );
}

const buttonVariants = {
  primary:
    "border-[#B91C1C] bg-[#B91C1C] text-white hover:border-[#991B1B] hover:bg-[#991B1B] active:border-[#7F1D1D] active:bg-[#7F1D1D]",
  destructive:
    "border-[#B91C1C] bg-[#B91C1C] text-white hover:border-[#991B1B] hover:bg-[#991B1B] active:border-[#7F1D1D] active:bg-[#7F1D1D]",
  secondary:
    "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
  ghost:
    "border-transparent bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700",
};

export function ModalButton({
  variant = "secondary",
  primary = false,
  className = "",
  type = "button",
  ref,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      ref={ref}
      data-modal-primary={primary || variant === "primary" ? "true" : undefined}
      className={`press-scale inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-4 text-[13px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/25 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-55 ${
        buttonVariants[variant] || buttonVariants.secondary
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
