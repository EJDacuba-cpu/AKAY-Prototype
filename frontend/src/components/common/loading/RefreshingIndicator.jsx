export default function RefreshingIndicator({
  show,
  label = "Refreshing...",
  className = "",
}) {
  if (!show) return null;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm ${className}`}
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-[#B91C1C]" />
      {label}
    </div>
  );
}
