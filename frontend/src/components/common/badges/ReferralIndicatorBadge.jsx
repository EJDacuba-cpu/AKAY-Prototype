import { formatDisplayValue } from "../../../utils/formatters";

function normalizeReferralStatus(status, hasReferral) {
  if (!hasReferral) return "No Referral";

  const compact = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!compact) return "Referred";
  if (["accepted", "received", "received by rhu"].includes(compact)) {
    return "Accepted";
  }
  if (["completed", "complete", "closed"].includes(compact)) {
    return "Done";
  }
  if (["pending", "pending rhu review", "for monitoring", "under assessment"].includes(compact)) {
    return "Pending";
  }

  return formatDisplayValue(status, "Referred");
}

export default function ReferralIndicatorBadge({
  status,
  hasReferral = false,
  compact = false,
}) {
  const label = normalizeReferralStatus(status, hasReferral);
  const styles = {
    "No Referral": "border-slate-200 bg-slate-50 text-slate-500",
    Referred: "border-blue-200 bg-blue-50 text-blue-700",
    Pending: "border-amber-200 bg-amber-50 text-amber-800",
    Accepted: "border-emerald-200 bg-emerald-50 text-emerald-700",
    Done: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      } ${styles[label] || "border-blue-200 bg-blue-50 text-blue-700"}`}
    >
      {label}
    </span>
  );
}
