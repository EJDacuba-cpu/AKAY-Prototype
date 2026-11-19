import { useMemo } from "react";

import { Button } from "../../../ui/button";
import { Card } from "../../../ui/card";
import { FieldList } from "./ProfileSection";
import { formatShortDate } from "../../../../utils/patientProfile";
import { epiDoseProgress } from "../../../../utils/careTracking";
import { EPI_INFANT_SCHEDULE } from "../../../../utils/careTrackingConfig";

function nextVisitDisplay(value) {
  if (!value) return "Not scheduled";
  return formatShortDate(value) || "Not scheduled";
}

function visitLabel(record) {
  return formatShortDate(record.dateOfVisit || record.date_of_visit || record.dateRecorded || record.date_recorded) || "Visit";
}

function DoseProgressChart({ rows }) {
  const givenCount = rows.filter((row) => row.given).length;
  const totalCount = rows.length || EPI_INFANT_SCHEDULE.length;
  const remainingCount = Math.max(0, totalCount - givenCount);
  const percent = totalCount ? Math.round((givenCount / totalCount) * 100) : 0;

  return (
    <div className="min-w-0 space-y-3">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold text-[#111827]">
            Given {givenCount} of {totalCount}
          </p>
          <p className="text-[11px] text-neutral-500">{remainingCount} pending · {percent}%</p>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-neutral-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalCount}
          aria-valuenow={givenCount}
          aria-label={`EPI doses given ${givenCount} of ${totalCount}`}
        >
          <div
            className="h-full rounded-full bg-[var(--color-ink-700,#0B1C30)] transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ul className="max-h-[280px] space-y-1 overflow-y-auto border border-neutral-200 bg-white p-2">
        {rows.map((row) => (
          <li
            key={row.name}
            className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-xs"
          >
            <span className="font-medium text-[#111827]">{row.name}</span>
            <span
              className={
                row.given
                  ? "font-semibold text-emerald-700"
                  : "font-medium text-amber-700"
              }
            >
              {row.given ? (row.dateGiven ? `Given · ${formatShortDate(row.dateGiven)}` : "Given") : "Pending"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Read-only EPI Care & Programs detail: facts + 15-dose given/pending chart.
 */
export default function EpiTrackingPanel({ entry, onViewRecords, onViewRecord }) {
  const history = useMemo(() => [...(entry?.records || [])].reverse(), [entry?.records]);
  const doseRows = useMemo(() => {
    if (Array.isArray(entry?.doseProgress) && entry.doseProgress.length) {
      return entry.doseProgress;
    }
    return epiDoseProgress(entry?.records || []);
  }, [entry?.doseProgress, entry?.records]);

  return (
    <Card className="rounded-lg border-neutral-200 bg-white p-5 shadow-none">
      <h3 className="text-sm font-bold text-[#0B1C30]">EPI / Immunization Tracking</h3>
      <p className="mt-1 text-xs text-neutral-500">{entry?.status || "—"} · read-only dose progress</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="max-w-xl">
          <FieldList
            rows={[
              ...(entry?.facts || []).map((fact) => [
                fact.label,
                fact.type === "date" ? formatShortDate(fact.value) : fact.value,
              ]),
              ["Last visit", entry?.lastVisit ? formatShortDate(entry.lastVisit) : ""],
              ["Next visit", nextVisitDisplay(entry?.nextVisit)],
            ]}
          />
          {Array.isArray(entry?.flags) && entry.flags.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {entry.flags.map((flag) => (
                <li
                  key={flag.label}
                  className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-600"
                >
                  {flag.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <DoseProgressChart rows={doseRows} />
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Consultation history</h4>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No saved EPI health records yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100 border border-neutral-200">
            {history.map((record, index) => (
              <li key={record.id ?? `epi-visit-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{visitLabel(record)}</span>
                {onViewRecord && record.id ? (
                  <Button type="button" variant="link" size="sm" onClick={() => onViewRecord(record.id)} className="h-auto p-0 text-xs">
                    Open record
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={() => onViewRecords?.("epi")}
        className="mt-4 h-auto rounded-lg p-0 text-xs"
      >
        View health records
      </Button>
    </Card>
  );
}
