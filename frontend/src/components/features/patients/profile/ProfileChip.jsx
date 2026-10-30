import { formatDisplayValue, formatReferralStatus, normalizeHealthRecordStatus } from "../../../../utils/formatters";

// The patient profile speaks in dark ink, white and red only. Red means "needs attention",
// an outlined ink chip means "in progress", and a quiet gray chip means "settled".
export const CHIP_TONES = {
  attention: { chip: "border-brand-200 bg-brand-50 text-brand-700", dot: "bg-brand-600" },
  active: { chip: "border-ink-400 bg-white text-ink-700", dot: "bg-ink-700" },
  quiet: { chip: "border-neutral-200 bg-neutral-100 text-neutral-600", dot: "bg-neutral-400" },
};

const STATUS_TONE = {
  "Needs Referral": "attention",
  "For Referral": "attention",
  "Follow-up Required": "attention",
  "No-Show": "attention",
  Pending: "active",
  Received: "active",
  Referred: "active",
  "Referred/Pending": "active",
  "Routine Monitoring": "active",
  "Under Observation": "active",
  "For Monitoring": "active",
  Active: "active",
};

const FOLLOW_UP_TONE = { due_today: "attention", no_show: "attention", upcoming: "active", rescheduled: "active" };

export const statusTone = (status) => STATUS_TONE[status] || "quiet";
export const followUpTone = (state) => FOLLOW_UP_TONE[state] || "quiet";

export function ProfileChip({ tone = "quiet", dot = false, className = "", children }) {
  const style = CHIP_TONES[tone] || CHIP_TONES.quiet;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.chip} ${className}`}>
      {dot && <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />}
      {children}
    </span>
  );
}

// Same labels as the shared StatusBadge, in the profile's palette.
export function ProfileStatusChip({ status }) {
  const label = normalizeHealthRecordStatus(formatDisplayValue(status, "Pending"), "Pending");
  return <ProfileChip tone={statusTone(label)} dot>{label}</ProfileChip>;
}

export function ReferralStatusChip({ status }) {
  const label = formatReferralStatus(formatDisplayValue(status, "Pending"), "Pending");
  return <ProfileChip tone={statusTone(label)} dot>{label}</ProfileChip>;
}
