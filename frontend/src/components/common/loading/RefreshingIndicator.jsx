export default function RefreshingIndicator({
  label = "Updating...",
  className = "",
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold text-slate-500 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className="h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
