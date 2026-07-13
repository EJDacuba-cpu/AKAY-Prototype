import { AlertTriangle, RotateCw, Save, X } from "lucide-react";

export default function ConnectionIssueModal({
  open,
  title = "Connection Lost",
  message = "Your internet connection was interrupted. Your current form data can be saved as a local draft and submitted once your connection is restored.",
  canRetry = true,
  retryDisabled = false,
  onContinue,
  onSaveDraft,
  onRetry,
}) {
  if (!open) return null;

  const hasDraftAction = Boolean(onSaveDraft);
  const actionGridClass =
    canRetry && hasDraftAction ? "sm:grid-cols-3" : "sm:grid-cols-2";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px] anim-overlay"
      onClick={onContinue}
    >
      <div
        className="anim-content-in relative w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onContinue}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-slate-50 hover:text-slate-500"
        >
          <X size={15} />
        </button>

        <div className="px-6 py-6">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-amber-100 bg-amber-50">
            <AlertTriangle size={20} className="text-amber-500" />
          </div>

          <h2 className="text-[15px] font-bold text-[#0F172A]">{title}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            {message}
          </p>

          <div className={`mt-6 grid gap-2 ${actionGridClass}`}>
            <button
              type="button"
              onClick={onContinue}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Continue Editing
            </button>
            {hasDraftAction && (
              <button
                type="button"
                onClick={onSaveDraft}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-[#B91C1C] transition hover:bg-red-100"
              >
                <Save size={14} />
                Save as Draft
              </button>
            )}
            {canRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={retryDisabled}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCw size={14} />
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
