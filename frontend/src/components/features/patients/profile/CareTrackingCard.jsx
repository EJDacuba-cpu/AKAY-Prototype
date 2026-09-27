import { ChevronRight } from "lucide-react";

import { formatShortDate } from "../../../../utils/patientProfile";

const STATUS_TONE_STYLES = {
  info: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
  success: "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]",
  warning: "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]",
  neutral: "border-[#E5E7EB] bg-[#F8FAFC] text-[#475569]",
};

const FLAG_TONE_STYLES = {
  warning: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  neutral: "border-[#E5E7EB] bg-[#F8FAFC] text-[#475569]",
};

function StatusBadge({ status, tone = "neutral" }) {
  return (
    <span
      className={`inline-flex items-center rounded-none border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        STATUS_TONE_STYLES[tone] || STATUS_TONE_STYLES.neutral
      }`}
    >
      {status}
    </span>
  );
}

function FlagChip({ label, tone = "neutral" }) {
  return (
    <span
      className={`inline-flex items-center rounded-none border px-2 py-0.5 text-[11px] font-medium ${
        FLAG_TONE_STYLES[tone] || FLAG_TONE_STYLES.neutral
      }`}
    >
      {label}
    </span>
  );
}

function formatFactValue(fact) {
  if (fact.type === "date") return formatShortDate(fact.value);
  return fact.value;
}

/**
 * One Care Tracking program's status card (Maternal, Family Planning, EPI or
 * TB), built from `getCareTracking` entries in utils/careTracking.js. Purely
 * presentational - all status logic already happened upstream.
 */
export default function CareTrackingCard({ entry, onViewRecords, onAction }) {
  const hasRecords = entry.records.length > 0;

  return (
    <div className="flex h-full flex-col rounded-card border border-[#E5E7EB] bg-white p-4 shadow-card">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 font-sans!">{entry.label}</h3>
        <StatusBadge status={entry.status} tone={entry.statusTone} />
      </div>

      {entry.facts.length > 0 && (
        <dl className="mb-2 space-y-1 text-xs text-gray-600">
          {entry.facts.map((fact) => (
            <div key={fact.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-400">{fact.label}</dt>
              <dd className="m-0 min-w-0 truncate text-right tabular-nums text-gray-800">
                {formatFactValue(fact)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {(entry.lastVisit || entry.nextVisit) && (
        <dl className="mb-2 space-y-1 text-xs text-gray-600">
          {entry.lastVisit && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-400">Last visit</dt>
              <dd className="m-0 tabular-nums text-gray-800">{formatShortDate(entry.lastVisit)}</dd>
            </div>
          )}
          {entry.nextVisit && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-400">Next visit</dt>
              <dd className="m-0 tabular-nums text-gray-800">{formatShortDate(entry.nextVisit)}</dd>
            </div>
          )}
        </dl>
      )}

      {entry.flags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {entry.flags.map((flag) => (
            <FlagChip key={flag.label} label={flag.label} tone={flag.tone} />
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        {entry.action ? (
          <button
            type="button"
            onClick={() => onAction?.(entry.action, entry)}
            className="inline-flex h-7 items-center rounded-none bg-red-600 px-2.5 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40"
          >
            {entry.action.label}
          </button>
        ) : (
          <span />
        )}

        {hasRecords && (
          <button
            type="button"
            onClick={() => onViewRecords?.(entry.key)}
            className="inline-flex items-center gap-0.5 rounded-sm text-xs font-medium text-red-600 transition hover:text-red-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40"
          >
            View records
            <ChevronRight size={12} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
