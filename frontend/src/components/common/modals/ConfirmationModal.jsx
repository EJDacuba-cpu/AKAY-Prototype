import { AlertTriangle, X, Loader2 } from "lucide-react";

export default function ConfirmationModal({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  loading = false,
  loadingText = "Saving...",
}) {
  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0 z-[9999]
        flex items-center justify-center p-4
        anim-overlay
        bg-slate-900/30
        backdrop-blur-[2px]
      "
      onClick={onCancel} // Click backdrop to close
    >
      {/* Stop click propagation so clicking inside doesn't close it */}
      <div
        className="
          anim-content-in
          relative w-full max-w-sm
          overflow-hidden rounded-xl
          border border-[#E5E7EB]
          bg-white
          shadow-xl shadow-slate-900/10
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onCancel}
          disabled={loading}
          className="
            absolute right-3 top-3
            flex h-7 w-7 items-center justify-center
            rounded-lg
            text-slate-300
            transition-all duration-150
            hover:bg-slate-50
            hover:text-slate-500
            disabled:opacity-0
          "
        >
          <X size={15} strokeWidth={2} />
        </button>

        {/* Content */}
        <div className="px-6 pt-6 pb-6">
          {/* Icon */}
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50 border border-amber-100/50">
            <AlertTriangle
              size={20}
              className="text-amber-500"
              strokeWidth={1.8}
            />
          </div>

          {/* Text */}
          <h2 className="text-[15px] font-bold text-[#0F172A] leading-snug">
            {title}
          </h2>

          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
            {description}
          </p>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="
                press-scale
                h-9.5 rounded-lg
                border border-slate-200
                bg-white
                px-4
                text-[13px] font-medium text-slate-600
                transition-all duration-150
                hover:bg-slate-50 hover:border-slate-300
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {cancelText}
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="
                press-scale
                flex h-9.5 items-center justify-center gap-2
                rounded-lg
                bg-[#B91C1C]
                px-4
                text-[13px] font-medium text-white
                transition-all duration-150
                hover:bg-[#991B1B]
                active:bg-[#7F1D1D]
                disabled:cursor-not-allowed disabled:opacity-60
              "
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              {loading ? loadingText : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
