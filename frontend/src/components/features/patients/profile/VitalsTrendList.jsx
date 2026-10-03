import { OverviewCard, OverviewNote } from "./OverviewCard";
import { buildVitalRows } from "../../../../utils/vitalTrends";
import { isVitalRecordToday } from "../../../../utils/currentPatientVitals";

const SPARK_WIDTH = 60;
const SPARK_HEIGHT = 18;
const SPARK_PAD = 2;

/**
 * Tiny trend line(s) for one vital, oldest reading on the left. Every line in
 * a row shares one scale (BP's systolic and diastolic). Shape only - no
 * colour or band says whether a reading is normal.
 */
function Sparkline({ series }) {
  if (!series.length) return <span className="block h-[18px] w-[60px]" aria-hidden="true" />;
  const values = series.flat();
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const point = (value, index, length) => [
    SPARK_PAD + (index * (SPARK_WIDTH - SPARK_PAD * 2)) / Math.max(length - 1, 1),
    SPARK_HEIGHT - SPARK_PAD - ((value - min) / span) * (SPARK_HEIGHT - SPARK_PAD * 2),
  ];

  return (
    <svg width={SPARK_WIDTH} height={SPARK_HEIGHT} viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} aria-hidden="true" className="block">
      {series.map((line, lineIndex) => {
        const points = line.map((value, index) => point(value, index, line.length));
        const [lastX, lastY] = points[points.length - 1];
        return (
          <g key={lineIndex}>
            <polyline
              points={points.map(([x, y]) => `${x},${y}`).join(" ")}
              className="fill-none stroke-slate-400 stroke-[1.25]"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx={lastX} cy={lastY} r={1.75} className="fill-slate-700" />
          </g>
        );
      })}
    </svg>
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

/** Latest vital signs with a short trend per vital, for the Overview left column. */
export default function VitalsTrendList({ records = [], isLoading = false }) {
  const { record, recordedAt, rows } = buildVitalRows(records);

  return (
    <OverviewCard
      id="overview-vitals"
      title="Latest Vital Signs"
      meta={formatRecordedAt(record, recordedAt)}
      maxHeight="max-h-[300px]"
    >
      <div aria-busy={isLoading}>
        {isLoading && records.length === 0 ? (
          <OverviewNote role="status">Loading vital signs...</OverviewNote>
        ) : !record ? (
          <OverviewNote>No vital signs recorded yet.</OverviewNote>
        ) : (
          <dl className="divide-y divide-gray-100">
            {rows.map(({ key, label, unit, display, series }) => (
              <div key={key} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 py-0.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="m-0 min-w-0 truncate text-sm font-semibold tabular-nums text-slate-900">
                  {display}
                  <span className="ml-1 text-[10px] font-normal text-slate-500">{unit}</span>
                </dd>
                <dd className="m-0">
                  <Sparkline series={series} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </OverviewCard>
  );
}
