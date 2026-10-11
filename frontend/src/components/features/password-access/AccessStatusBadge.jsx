const TONES = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700",
  complete: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600",
};

/** One of the four shared statuses (spec F1); the reason is the tooltip. */
export default function AccessStatusBadge({ status, label, reason }) {
  return (
    <span
      title={reason}
      className={`inline-flex cursor-default whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
        TONES[status] || TONES.pending
      }`}
    >
      {label}
    </span>
  );
}
