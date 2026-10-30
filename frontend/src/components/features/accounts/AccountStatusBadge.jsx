import { formatDisplayValue } from "../../../utils/formatters";

// Active is the one state worth green; Inactive is a quiet gray, not a warning (the same chip as Password & Invites).
const STYLES = {
  Active: { chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  Inactive: { chip: "bg-neutral-100 text-neutral-600 ring-neutral-200", dot: "bg-neutral-400" },
};
const FALLBACK = { chip: "bg-neutral-100 text-neutral-600 ring-neutral-200", dot: "bg-neutral-400" };

/** Active / Inactive chip, shared by the Users table and Account details. */
export default function AccountStatusBadge({ status }) {
  const displayStatus = formatDisplayValue(status, "Active");
  const tone = STYLES[displayStatus] || FALLBACK;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset ${tone.chip}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {displayStatus}
    </span>
  );
}
