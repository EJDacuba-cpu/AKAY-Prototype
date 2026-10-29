import { useState } from "react";
import { Droplet, Gauge, HeartPulse, Thermometer, Wind } from "lucide-react";

import { buildVitalRows, buildVitalTrendPlot } from "../../../../utils/vitalTrends";
import { isVitalRecordToday } from "../../../../utils/currentPatientVitals";
import { visibleOverviewVitalKeys } from "../../../../utils/infantVisibility";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../ui/tooltip";

const EMPTY = "—";

// The same cards are always drawn, so their sizes never depend on the patient;
// a vital with no reading just shows a dash. FBS is only shown once recorded.
// Height, weight and BMI live with the body figure (BodyMeasures).
const CHART_CARDS = ["bp", "pulse", "temperature", "spo2"];
const DEFAULTS = {
  bp: { label: "BP", unit: "mmHg", Icon: Gauge },
  pulse: { label: "Pulse", unit: "bpm", Icon: HeartPulse },
  temperature: { label: "Temp", unit: "°C", Icon: Thermometer },
  spo2: { label: "SpO₂", unit: "%", Icon: Wind },
  fbs: { label: "FBS", unit: "mg/dL", Icon: Droplet },
};

const CARD = "rounded-xl border border-neutral-200/80 bg-white px-3 py-2.5 shadow-card";
const LABEL = "text-xs font-medium text-neutral-600";

const historyDate = (date) => date.toLocaleString("en-PH", {
  timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
});

/**
 * Compact recorded-visit history. One focus stop per chart; arrow keys inspect
 * visits. Pointer position selects the nearest visit, not an invented sample.
 */
function TrendChart({ history, label, unit, onInspectChange }) {
  const [selection, setSelection] = useState(null);
  const [open, setOpen] = useState(false);
  const { points, lines } = buildVitalTrendPlot(history);
  if (!points.length) return <p className="min-h-0 flex-1 text-[11px] text-neutral-500">No numeric history recorded.</p>;
  const latestIndex = points.findIndex((point) => point.isLatest);
  const index = Math.min(selection ?? (latestIndex < 0 ? points.length - 1 : latestIndex), points.length - 1);
  const selected = points[index];

  const changeOpen = (next) => {
    setOpen(next);
    onInspectChange(next);
  };
  const inspectPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    setSelection(points.reduce((best, point, candidate) => Math.abs(point.x - x) < Math.abs(points[best].x - x) ? candidate : best, 0));
  };
  const inspectKey = (event) => {
    const next = { ArrowLeft: Math.max(0, index - 1), ArrowRight: Math.min(points.length - 1, index + 1), Home: 0, End: points.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setSelection(next);
    changeOpen(true);
  };

  return (
    <Tooltip open={open} onOpenChange={changeOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="patient-vitals__trend relative min-h-6 w-full flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ink-400 focus-visible:ring-offset-2"
          aria-label={`${label} history: ${selected.display} ${unit}, ${historyDate(selected.date)}. ${points.length} recorded ${points.length === 1 ? "visit" : "visits"}. Use left and right arrow keys to inspect.`}
          onPointerMove={inspectPointer}
          onPointerDown={inspectPointer}
          onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setSelection(null); }}
          onKeyDown={inspectKey}
          onClick={(event) => { event.preventDefault(); changeOpen(!open); }}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
            <line x1="6" y1="96" x2="94" y2="96" vectorEffect="non-scaling-stroke" className="stroke-neutral-200 stroke-1" />
            {open && <line x1={selected.x} y1="4" x2={selected.x} y2="92" vectorEffect="non-scaling-stroke" strokeDasharray="2 3" className="stroke-neutral-300 stroke-1" />}
            {lines.map((line, lineIndex) => (
              <polyline
                key={`${line.seriesIndex}-${lineIndex}`}
                points={line.points.map(({ x, y }) => `${x},${y}`).join(" ")}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="miter"
                strokeLinecap="round"
                className={`fill-none stroke-[1.75] ${line.seriesIndex === 0 ? "stroke-ink-600" : "stroke-neutral-500"}`}
              />
            ))}
          </svg>
          {points.flatMap((point, pointIndex) => point.ys.map((y, seriesIndex) => y === null ? null : (
            <span
              key={`${point.key}-${seriesIndex}`}
              aria-hidden="true"
              className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${seriesIndex === 0 ? "bg-ink-700" : "bg-neutral-500"} ${open && pointIndex === index ? "size-2 ring-2 ring-white" : point.isLatest ? "size-1.5" : "size-1"}`}
              style={{ left: `${point.x}%`, top: `${y}%` }}
            />
          )))}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="min-w-44 space-y-1.5 tabular-nums">
        <p className="font-semibold text-neutral-900">{label}: {selected.display} <span className="font-normal text-neutral-600">{unit}</span></p>
        {selected.values.length === 2 && (
          <div className="flex gap-3 text-[11px] text-neutral-600">
            <span className="flex items-center gap-1"><span aria-hidden="true" className="size-1.5 rounded-full bg-ink-700" />Systolic</span>
            <span className="flex items-center gap-1"><span aria-hidden="true" className="size-1.5 rounded-full bg-neutral-500" />Diastolic</span>
          </div>
        )}
        <time dateTime={selected.date.toISOString()} className="block text-[11px] text-neutral-600">{historyDate(selected.date)}</time>
        <p className="text-[11px] text-neutral-500">{selected.isLatest ? "Latest recorded visit" : "Previous recorded visit"}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function Label({ Icon, children }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon size={14} className="shrink-0 text-neutral-400" aria-hidden="true" />
      <span className={`${LABEL} truncate`}>{children}</span>
    </span>
  );
}

function Value({ display, unit }) {
  return (
    <span className="min-w-0 whitespace-normal text-[17px] font-semibold tabular-nums tracking-tight text-neutral-900">
      {display}
      <span className="ml-1 text-[11px] font-normal tracking-normal text-neutral-500">{unit}</span>
    </span>
  );
}

function formatRecordedAt(record, recordedAt) {
  if (!recordedAt) return "";
  const today = isVitalRecordToday(record);
  return `${today ? "Today, " : ""}${recordedAt.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    ...(today ? {} : { month: "short", day: "numeric", year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/**
 * Left column of the Overview board: a plain heading, then one separate card
 * per vital (BP, pulse, temperature, SpO2) with its latest value and a trend
 * of the last few readings; FBS adds a small value-only card once recorded.
 * Height, weight and BMI sit with the body figure. The fixed desktop board
 * divides its available height among the cards; smaller screens use normal
 * document flow. This column never creates its own scroll region.
 */
export default function VitalsTiles({ records = [], isLoading = false, infant = false }) {
  const [inspectedKey, setInspectedKey] = useState(null);
  const { record, recordedAt, rows } = buildVitalRows(records);
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
  const card = (key) => ({ ...DEFAULTS[key], display: EMPTY, history: [], ...byKey[key], key });
  const note = isLoading && records.length === 0 ? "Loading..." : !record ? "No vital signs recorded yet." : "";
  const chartKeys = visibleOverviewVitalKeys(CHART_CARDS, byKey, { infant });

  return (
    <TooltipProvider delayDuration={180} skipDelayDuration={100}>
      <section aria-labelledby="overview-vitals-title" aria-busy={isLoading} className="patient-vitals flex min-h-0 flex-1 flex-col flow:flex-none">
        <header className="mb-2 flex min-h-5 shrink-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 px-0.5">
          <h2 id="overview-vitals-title" className="text-[13px] font-semibold text-neutral-900 font-sans!">
            Latest vital signs
          </h2>
          <span className="text-xs tabular-nums text-neutral-500" role={note ? "status" : undefined}>
            {note || formatRecordedAt(record, recordedAt)}
          </span>
        </header>

        {/* Keep the same four cards visible for recorded, loading, and empty states. */}
        <div className="patient-vitals__body min-h-0 flex-1 overflow-visible">
          <div className="patient-vitals__grid flex flex-col gap-3">
            {chartKeys.map((key) => {
              const { label, unit, display, history, Icon } = card(key);
              return (
                <div key={key} data-inspecting={inspectedKey === key || undefined} className={`${CARD} patient-vitals__tile flex h-[92px] shrink-0 flex-col gap-1.5`}>
                  <div className="flex shrink-0 items-center justify-between gap-2">
                    <Label Icon={Icon}>{label}</Label>
                    <Value display={display} unit={unit} />
                  </div>
                  {display === EMPTY ? (
                    <p className="patient-vitals__empty flex min-h-0 flex-1 items-center text-[11px] leading-4 text-neutral-500">
                      {isLoading && !record ? "Loading reading..." : !record ? "No reading recorded." : "Not recorded in latest visit."}
                    </p>
                  ) : (
                    <TrendChart history={history} label={label} unit={unit} onInspectChange={(open) => setInspectedKey((current) => open ? key : current === key ? null : current)} />
                  )}
                </div>
              );
            })}

            {byKey.fbs && (
              <div className={`${CARD} patient-vitals__fbs flex h-16 min-w-0 flex-col justify-between`}>
                <Label Icon={DEFAULTS.fbs.Icon}>{DEFAULTS.fbs.label}</Label>
                <Value display={card("fbs").display} unit={DEFAULTS.fbs.unit} />
              </div>
            )}
          </div>
        </div>
      </section>
    </TooltipProvider>
  );
}
