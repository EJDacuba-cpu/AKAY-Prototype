const TONE_BADGE = {
  info: "border-info-100 bg-info-50 text-info-700",
  warning: "border-warning-100 bg-warning-50 text-warning-700",
  danger: "border-alert-100 bg-alert-50 text-alert-700",
  success: "border-success-100 bg-success-50 text-success-700",
  neutral: "border-neutral-200 bg-neutral-100 text-neutral-600",
};

/**
 * Compact list-table status: sentence-case label + trailing tone dot
 * (Health Commodities / ledger stamp look).
 */
export default function PlainStatusStamp({
  label,
  tone = "neutral",
  appearance = "plain",
  className = "",
}) {
  const toneClass = TONE_BADGE[tone] || TONE_BADGE.neutral;
  const plain = appearance === "plain";

  return (
    <span
      data-tone={tone}
      className={[
        "akay-status-stamp inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        toneClass,
        plain ? "akay-status-plain" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        aria-hidden="true"
        className="akay-status-plain-dot size-1.5 rounded-full bg-current"
      />
      {label}
    </span>
  );
}
