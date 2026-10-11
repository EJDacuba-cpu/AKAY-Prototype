const CHIP = "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

const TIERS = {
  critical: ["Critical", "bg-red-100 text-red-800"],
  sensitive: ["Sensitive", "bg-amber-100 text-amber-800"],
  override: ["Override", "bg-slate-200 text-slate-700"],
};

const SOURCES = {
  default: ["Default", "bg-red-50 text-red-700"],
  standard: ["Added", "bg-slate-100 text-slate-600"],
  new: ["New", "bg-emerald-50 text-emerald-700"],
  removed: ["Removed", "bg-slate-100 text-slate-500"],
};

export function TierChip({ tier, children }) {
  const [label, tone] = TIERS[tier] || TIERS.override;
  return <span className={`${CHIP} ${tone}`}>{children || label}</span>;
}

export function SourceChip({ source }) {
  const [label, tone] = SOURCES[source] || SOURCES.standard;
  return <span className={`${CHIP} ${tone}`}>{label}</span>;
}
