export default function InlineSpinner({ label = "Loading...", className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[12px] font-medium text-slate-500 ${className}`}
    >
      <span
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-[#B91C1C]"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
