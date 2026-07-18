import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, RotateCw, Save, X } from "lucide-react";

export default function ConnectionIssueModal({
  open,
  title = "Connection Lost",
  message = "Your internet connection was interrupted. Your current form data can be saved as a local draft and submitted once your connection is restored.",
  canRetry = true,
  retryDisabled = false,
  retryLabel = "Retry",
  retryLoading = false,
  retryLoadingLabel = "Retrying...",
  onContinue,
  onSaveDraft,
  onRetry,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const retryButtonRef = useRef(null);
  const mountedRef = useRef(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [internalRetrying, setInternalRetrying] = useState(false);
  const hasDraftAction = Boolean(onSaveDraft);
  const retryBusy = Boolean(retryLoading || internalRetrying);
  const actionBusy = retryBusy || draftSaving;
  const actionGridClass = canRetry && hasDraftAction ? "lg:grid-cols-3" : "sm:grid-cols-2";

  useEffect(() => {
    if (!open) {
      mountedRef.current = false;
      setDraftSaving(false);
      setInternalRetrying(false);
      return undefined;
    }

    mountedRef.current = true;
    const focusTimer = window.setTimeout(() => {
      retryButtonRef.current?.focus();
    }, 80);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  if (!open) return null;

  function handleContinue() {
    if (actionBusy) return;
    onContinue?.();
  }

  async function handleSaveDraft() {
    if (!onSaveDraft || actionBusy) return;
    setDraftSaving(true);
    try {
      await onSaveDraft();
    } finally {
      if (mountedRef.current) setDraftSaving(false);
    }
  }

  async function handleRetry() {
    if (!onRetry || actionBusy || retryDisabled) return;
    setInternalRetrying(true);
    try {
      await onRetry();
    } finally {
      if (mountedRef.current) setInternalRetrying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[3px] anim-overlay sm:p-6"
      onClick={handleContinue}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="anim-content-in relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/14"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-1 bg-gradient-to-r from-[#B91C1C] via-[#DC2626] to-red-100" />
        <button
          type="button"
          onClick={handleContinue}
          disabled={actionBusy}
          aria-label="Close connection modal"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-50 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 disabled:pointer-events-none disabled:opacity-40"
        >
          <X size={15} />
        </button>

        <div className="px-6 py-7 sm:px-8 sm:py-8">
          <div className="flex items-start gap-4 pr-8">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-100 bg-red-50 text-[#B91C1C] shadow-sm shadow-red-100/70">
              <AlertTriangle size={21} strokeWidth={1.9} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B91C1C]">
                Save interrupted
              </p>
              <h2
                id={titleId}
                className="mt-1 text-xl font-bold tracking-tight text-[#0F172A]"
              >
                {title}
              </h2>
              <p
                id={descriptionId}
                className="mt-2 text-sm leading-6 text-slate-500"
              >
                {message}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
            <p className="text-xs leading-relaxed text-slate-500">
              Your entries are still on this form. Continue editing, keep a
              local draft on this device, or retry the official save when the
              connection is stable.
            </p>
          </div>

          <div className={`mt-6 grid gap-2 ${actionGridClass}`}>
            <button
              type="button"
              onClick={handleContinue}
              disabled={actionBusy}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continue Editing
            </button>
            {hasDraftAction && (
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={actionBusy}
                aria-busy={draftSaving}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 text-sm font-semibold text-[#B91C1C] transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {draftSaving ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Save size={15} />
                )}
                {draftSaving ? "Saving..." : "Save as Draft"}
              </button>
            )}
            {canRetry && (
              <button
                ref={retryButtonRef}
                type="button"
                onClick={handleRetry}
                disabled={retryDisabled || actionBusy}
                aria-busy={retryBusy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-4 text-sm font-semibold text-white shadow-lg shadow-red-900/10 transition hover:bg-[#991B1B] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/25 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {retryBusy ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <RotateCw size={15} />
                )}
                {retryBusy ? retryLoadingLabel : retryLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
