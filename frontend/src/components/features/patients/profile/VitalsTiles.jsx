import { Droplet, Gauge, HeartPulse, Thermometer, Wind } from "lucide-react";

import { buildVitalRows } from "../../../../utils/vitalTrends";
import { isVitalRecordToday } from "../../../../utils/currentPatientVitals";

// Keeps the first/last point and the extremes off the chart edges.
const PAD_X = 4;
const PAD_Y = 12;
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
 * however the chart is stretched.
 */
function TrendChart({ series }) {
  if (!series.length) return <div className="min-h-0 flex-1" aria-hidden="true" />;
  const lines = plot(series);

  return (
    <div className="relative min-h-0 flex-1" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        {lines.map((points, lineIndex) => (
          <polyline
            key={lineIndex}
            points={points.map(([x, y]) => `${x},${y}`).join(" ")}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
            className={`fill-none stroke-[1.75] ${lineIndex === 0 ? "stroke-ink-600" : "stroke-neutral-300"}`}
          />
        ))}
      </svg>
      {lines.map((points, lineIndex) => {
        const [x, y] = points[points.length - 1];
        return (
          <span
            key={lineIndex}
            className={`absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${lineIndex === 0 ? "bg-ink-700" : "bg-neutral-400"}`}
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
export default function VitalsTiles({ records = [], isLoading = false }) {
  const { record, recordedAt, rows } = buildVitalRows(records);
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
  const card = (key) => ({ ...DEFAULTS[key], display: EMPTY, series: [], ...byKey[key], key });
  const note = isLoading && records.length === 0 ? "Loading..." : !record ? "No vital signs recorded yet." : "";

  return (
    <section aria-labelledby="overview-vitals-title" aria-busy={isLoading} className="patient-vitals flex min-h-0 flex-1 flex-col flow:flex-none">
      <header className="mb-2 flex min-h-5 shrink-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 px-0.5">
        <h2 id="overview-vitals-title" className="text-[13px] font-semibold text-neutral-900 font-sans!">
          Latest vital signs
        </h2>
        <span className="text-xs tabular-nums text-neutral-500" role={note ? "status" : undefined}>
          {note || formatRecordedAt(record, recordedAt)}
        </span>
      </header>

      {/* With no reading at all, flow layouts (mobile, short windows) drop the
          empty tiles and keep only the note above; the fixed board keeps them
          so its geometry never depends on the patient. */}
      <div
        className={`patient-vitals__body min-h-0 flex-1 overflow-visible ${
          !record && !isLoading ? "flow:hidden" : ""
        }`}
      >
        <div className="patient-vitals__grid flex flex-col gap-3">
          {CHART_CARDS.map((key) => {
            const { label, unit, display, series, Icon } = card(key);
            return (
              <div key={key} className={`${CARD} patient-vitals__tile flex h-[92px] shrink-0 flex-col gap-1.5`}>
                <div className="flex shrink-0 items-center justify-between gap-2">
                  <Label Icon={Icon}>{label}</Label>
                  <Value display={display} unit={unit} />
                </div>
                <TrendChart series={series} />
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
  );
}
