const CHIP = "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

// Informational only: Added/Removed compare against the role defaults; Licensed marks a licensed act on a non-licensed role.
const KINDS = {
  added: ["Added", "bg-slate-100 text-slate-600"],
  removed: ["Removed", "bg-slate-100 text-slate-500"],
  licensed: ["Licensed", "bg-red-100 text-red-800"],
};

export function AccessChip({ kind }) {
  const [label, tone] = KINDS[kind];
  return <span className={`${CHIP} ${tone}`}>{label}</span>;
}
