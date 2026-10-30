const TONES = {
  pending: { chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  in_progress: { chip: "bg-blue-50 text-blue-800 ring-blue-200", dot: "bg-blue-500" },
  complete: { chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  cancelled: { chip: "bg-neutral-100 text-neutral-600 ring-neutral-200", dot: "bg-neutral-400" },
};

/** One of the four shared statuses (spec F1); the reason is the tooltip, and the table also prints it under the chip. */
export default function AccessStatusBadge({ status, label, reason }) {
  const tone = TONES[status] || TONES.pending;
  return (
    <span
      title={reason}
      className={`inline-flex cursor-default items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset ${tone.chip}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}
