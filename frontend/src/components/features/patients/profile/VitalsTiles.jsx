import { Activity, Droplet, Gauge, HeartPulse, Ruler, Scale, Thermometer, Wind } from "lucide-react";

import { buildVitalRows } from "../../../../utils/vitalTrends";
import { isVitalRecordToday } from "../../../../utils/currentPatientVitals";

// Keeps the first/last point and the extremes off the chart edges.
const PAD_X = 4;
const PAD_Y = 12;
const EMPTY = "—";

// The same cards are always drawn, so their sizes never depend on the patient;
// a vital with no reading just shows a dash. FBS is only shown once recorded.
const CHART_CARDS = ["bp", "pulse", "temperature", "spo2", "weight"];
const SMALL_CARDS = ["height", "bmi"];
const DEFAULTS = {
  bp: { label: "BP", unit: "mmHg", Icon: Gauge },
  pulse: { label: "Pulse", unit: "bpm", Icon: HeartPulse },
  temperature: { label: "Temp", unit: "°C", Icon: Thermometer },
  spo2: { label: "SpO₂", unit: "%", Icon: Wind },
  weight: { label: "Weight", unit: "kg", Icon: Scale },
  height: { label: "Height", unit: "cm", Icon: Ruler },
  bmi: { label: "BMI", unit: "kg/m²", Icon: Activity },
  fbs: { label: "FBS", unit: "mg/dL", Icon: Droplet },
};

const CARD = "border border-gray-200 bg-white px-2.5 py-2";
const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

/**
 * Maps readings onto 0-100 chart space, oldest on the left. Every line in a
 * card shares one scale (BP's systolic and diastolic), so the lines stay
 * comparable. Shape only - nothing here says whether a reading is normal.
 */
function plot(series) {
  const values = series.flat();
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return series.map((line) =>
    line.map((value, index) => [
      line.length === 1 ? 50 : PAD_X + (index * (100 - PAD_X * 2)) / (line.length - 1),
      100 - PAD_Y - ((value - min) / span) * (100 - PAD_Y * 2),
    ]),
  );
}

/**
 * Trend chart that stretches to its card. The lines are an SVG with a
 * non-scaling stroke; the latest reading is an HTML dot so it stays round
 * however the chart is stretched. Weight is drawn as bars.
 */
function TrendChart({ series, bars = false }) {
  if (!series.length) return <div className="min-h-0 flex-1" aria-hidden="true" />;
  const lines = plot(series);

  return (
    <div className="relative min-h-0 flex-1" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        {bars
          ? lines[0].map(([x, y], index) => (
              <rect
                key={index}
                x={x - 4}
                y={y}
                width={8}
                height={100 - y}
                className={index === lines[0].length - 1 ? "fill-slate-500" : "fill-slate-200"}
              />
            ))
          : lines.map((points, lineIndex) => (
              <polyline
                key={lineIndex}
                points={points.map(([x, y]) => `${x},${y}`).join(" ")}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                className={`fill-none stroke-[1.5] ${lineIndex === 0 ? "stroke-slate-500" : "stroke-slate-300"}`}
              />
            ))}
      </svg>
      {!bars &&
        lines.map((points, lineIndex) => {
          const [x, y] = points[points.length - 1];
          return (
            <span
              key={lineIndex}
              className={`absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${lineIndex === 0 ? "bg-slate-700" : "bg-slate-400"}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          );
        })}
    </div>
  );
}

function Label({ Icon, children }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon size={13} className="shrink-0 text-slate-400" aria-hidden="true" />
      <span className={`${LABEL} truncate`}>{children}</span>
    </span>
  );
}

function Value({ display, unit }) {
  return (
    <span className="min-w-0 truncate text-base font-semibold tabular-nums text-slate-900">
      {display}
      <span className="ml-1 text-[10px] font-normal text-slate-500">{unit}</span>
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
 * per vital with its latest value and a trend of the last few readings.
 * Height and BMI, which rarely trend, are small value-only cards in a row at
 * the bottom. Cards are a fixed size and stack from the top - the column is
 * not stretched - and scrolls on its own only in a window too short for them.
 */
export default function VitalsTiles({ records = [], isLoading = false }) {
  const { record, recordedAt, rows } = buildVitalRows(records);
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
  const card = (key) => ({ ...DEFAULTS[key], display: EMPTY, series: [], ...byKey[key], key });
  const note = isLoading && records.length === 0 ? "Loading..." : !record ? "No vital signs recorded yet." : "";

  return (
    <section aria-labelledby="overview-vitals-title" aria-busy={isLoading} className="flex min-h-0 flex-1 flex-col">
      <header className="mb-1.5 flex min-h-4 shrink-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 px-0.5">
        <h2 id="overview-vitals-title" className={`${LABEL} tracking-[0.08em] font-sans!`}>
          Latest Vital Signs
        </h2>
        <span className="text-[11px] tabular-nums text-slate-400" role={note ? "status" : undefined}>
          {note || formatRecordedAt(record, recordedAt)}
        </span>
      </header>

      <div className="akay-content-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-1.5">
          {CHART_CARDS.map((key) => {
            const { label, unit, display, series, Icon } = card(key);
            return (
              <div key={key} className={`${CARD} flex h-[90px] shrink-0 flex-col gap-1`}>
                <div className="flex shrink-0 items-center justify-between gap-2">
                  <Label Icon={Icon}>{label}</Label>
                  <Value display={display} unit={unit} />
                </div>
                <TrendChart series={series} bars={key === "weight"} />
              </div>
            );
          })}

          <div className="grid grid-cols-2 gap-1.5">
            {[...SMALL_CARDS, ...(byKey.fbs ? ["fbs"] : [])].map((key) => {
              const { label, unit, display, Icon } = card(key);
              return (
                <div key={key} className={`${CARD} flex h-14 min-w-0 flex-col justify-between`}>
                  <Label Icon={Icon}>{label}</Label>
                  <Value display={display} unit={unit} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
