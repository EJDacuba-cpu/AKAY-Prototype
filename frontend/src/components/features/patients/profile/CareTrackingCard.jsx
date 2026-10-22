import { ChevronRight } from "lucide-react";

import { Button } from "../../../ui/button";
import { Card } from "../../../ui/card";
import { formatShortDate } from "../../../../utils/patientProfile";

const STATUS_TONE_STYLES = {
  info: "border-ink-400 bg-white text-ink-700",
  success: "border-neutral-200 bg-neutral-100 text-ink-700",
  warning: "border-brand-200 bg-brand-50 text-brand-700",
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-600",
};

const FLAG_TONE_STYLES = {
  warning: "border-alert-100 bg-alert-50 text-alert-700",
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-600",
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
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium ${
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
    <Card className={`flex h-full min-w-0 flex-col rounded-xl p-4 shadow-card ${selected ? "border-ink-300 ring-1 ring-ink-200" : "border-neutral-200/80"}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-medium text-neutral-500">{entry.key === "tb" ? "Disease" : "Program"}</span>
          <h3 className="mt-2 text-sm font-semibold text-neutral-900 font-sans!">{entry.label}</h3>
        </div>
        <StatusBadge
          status={entry.key === "maternal" && entry.status === "Prenatal" ? "Active" : entry.status}
          tone={entry.key === "maternal" && entry.status === "Prenatal" ? "success" : entry.statusTone}
        />
      </div>

      {entry.facts.length > 0 && (
        <dl className="mb-2 space-y-1 text-xs text-neutral-600">
          {entry.facts.map((fact) => (
            <div key={fact.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-neutral-500">{fact.label}</dt>
              <dd className="m-0 min-w-0 truncate text-right tabular-nums text-neutral-800">
                {formatFactValue(fact)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {(entry.lastVisit || entry.nextVisit) && (
        <dl className="mb-2 space-y-1 text-xs text-neutral-600">
          {entry.lastVisit && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-neutral-500">Last visit</dt>
              <dd className="m-0 tabular-nums text-neutral-800">{formatShortDate(entry.lastVisit)}</dd>
            </div>
          )}
          {entry.nextVisit && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-neutral-500">Next visit</dt>
              <dd className="m-0 tabular-nums text-neutral-800">{formatShortDate(entry.nextVisit)}</dd>
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
            className="h-7 rounded-lg px-2.5 text-xs"
          >
            {entry.action.label}
          </Button>
        ) : (
          <span />
        )}

        {hasRecords && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="link" size="sm" onClick={() => onOpen?.(entry.key)} aria-pressed={selected} className="h-auto rounded-lg p-0 text-xs no-underline hover:underline">
              Open Tracking <ChevronRight size={12} aria-hidden="true" />
            </Button>
            <Button type="button" variant="link" size="sm" onClick={() => onViewRecords?.(entry.key)} className="h-auto rounded-lg p-0 text-xs text-neutral-500 no-underline hover:underline">
              View records
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
