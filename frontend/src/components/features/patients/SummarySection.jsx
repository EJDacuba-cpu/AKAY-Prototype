/**
 * Label/value block for patient summaries. The default "soft" look is the
 * consultation drawer's; "clinical" is the sharp, bordered, high-density look
 * used by the patient directory's summary panel.
 */
export default function SummarySection({ title, rows, variant = "soft" }) {
  if (variant === "clinical") {
    return <section className="mt-4 border border-gray-200 bg-white">
      <h3 className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-700">{title}</h3>
      <dl className="divide-y divide-gray-200">{rows.map(([label, value]) => <div key={label} className="grid grid-cols-[112px_minmax(0,1fr)] gap-2 px-3 py-1.5"><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</dt><dd className="break-words text-xs font-medium text-gray-900">{value || "Not recorded"}</dd></div>)}</dl>
    </section>;
  }

  return <section className="mt-5"><h3 className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">{title}</h3>
    <dl className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3">{rows.map(([label, value]) => <div key={label}><dt className="text-[11px] text-slate-500">{label}</dt><dd className="mt-1 break-words text-xs text-slate-900">{value || "Not recorded"}</dd></div>)}</dl>
  </section>;
}
