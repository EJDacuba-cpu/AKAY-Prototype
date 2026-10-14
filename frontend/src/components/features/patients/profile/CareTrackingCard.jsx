import { ChevronRight } from "lucide-react";

import { Button } from "../../../ui/button";
import { Card } from "../../../ui/card";
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
      className={`inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[11px] font-semibold ${
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
export default function CareTrackingCard({ entry, onViewRecords, onAction, onOpen, selected = false }) {
  const hasRecords = entry.records.length > 0;

  return (
    <Card className={`flex h-full min-w-0 flex-col rounded-none p-4 shadow-none ${selected ? "border-red-300" : "border-[#E5E7EB]"}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-medium text-[#6B7280]">{entry.key === "tb" ? "Disease" : "Program"}</span>
          <h3 className="mt-2 text-sm font-semibold text-gray-900 font-sans!">{entry.label}</h3>
        </div>
        <StatusBadge
          status={entry.key === "maternal" && entry.status === "Prenatal" ? "Active" : entry.status}
          tone={entry.key === "maternal" && entry.status === "Prenatal" ? "success" : entry.statusTone}
        />
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
          <Button
            type="button"
            onClick={() => onAction?.(entry.action, entry)}
            size="sm"
            className="h-7 rounded-none px-2.5 text-xs"
          >
            {entry.action.label}
          </Button>
        ) : (
          <span />
        )}

        {hasRecords && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="link" size="sm" onClick={() => onOpen?.(entry.key)} aria-pressed={selected} className="h-auto rounded-none p-0 text-xs no-underline hover:underline">
              Open Tracking <ChevronRight size={12} aria-hidden="true" />
            </Button>
            <Button type="button" variant="link" size="sm" onClick={() => onViewRecords?.(entry.key)} className="h-auto rounded-none p-0 text-xs text-slate-500 no-underline hover:underline">
              View records
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
