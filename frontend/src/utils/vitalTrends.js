import { calculateBmi, formatBmi } from "./bmi.js";
import { getLatestVitalRecord, getVitalRecordDate, hasVitalValue } from "./currentPatientVitals.js";

/**
 * Latest vital signs plus a short history per vital for the profile's
 * sparklines. Values only: nothing here judges a reading normal or abnormal.
 */
export const TREND_LENGTH = 6;

const EMPTY = "—";

const SINGLE_VITALS = [
  { key: "pulse", label: "Pulse", unit: "bpm", field: "pulse" },
  { key: "temperature", label: "Temp", unit: "°C", field: "temperature" },
  { key: "spo2", label: "SpO₂", unit: "%", field: "spo2" },
  { key: "weight", label: "Weight", unit: "kg", field: "weight" },
  { key: "height", label: "Height", unit: "cm", field: "height" },
];

function toNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function shown(value) {
  return hasVitalValue(value) ? String(value).trim() : EMPTY;
}

/**
 * @returns {{ record: object|null, recordedAt: Date|null,
 *   rows: { key: string, label: string, unit: string, display: string, history: object[] }[] }}
 */
export function buildVitalRows(records) {
  const list = Array.isArray(records) ? records : [];
  const record = getLatestVitalRecord(list);
  if (!record) return { record: null, recordedAt: null, rows: [] };

  const ordered = list
    .map((item, index) => ({ item, index, date: item ? getVitalRecordDate(item) : null }))
    .filter(({ date }) => date)
    .sort((a, b) => a.date - b.date);

  // Keep each value attached to its visit. Missing BP sides remain null rather
  // than shifting the other line onto a different visit's date.
  const history = (read, display) => ordered
    .map(({ item, date, index }) => {
      const values = read(item);
      return {
        key: `${item.id ?? index}:${date.getTime()}`,
        recordId: item.id ?? null,
        date,
        values,
        display: display(item, values),
        isLatest: item === record,
      };
    })
    .filter((point) => point.values.some((value) => value !== null))
    .slice(-TREND_LENGTH);

  const single = (field) => history((item) => [toNumber(item[field])], (item) => shown(item[field]));
  const hasBp = hasVitalValue(record.systolicBp) || hasVitalValue(record.diastolicBp);
  const latestBmi = calculateBmi(record.weight, record.height);

  const rows = [
    {
      key: "bp",
      label: "BP",
      unit: "mmHg",
      display: hasBp ? `${shown(record.systolicBp)}/${shown(record.diastolicBp)}` : EMPTY,
      history: history(
        (item) => [toNumber(item.systolicBp), toNumber(item.diastolicBp)],
        (item, values) => ["systolicBp", "diastolicBp"].map((field, index) => values[index] === null ? EMPTY : shown(item[field])).join("/"),
      ),
    },
    ...SINGLE_VITALS.map(({ field, ...meta }) => ({
      ...meta,
      display: shown(record[field]),
      history: single(field),
    })),
    {
      key: "bmi",
      label: "BMI",
      unit: "kg/m²",
      display: latestBmi === null ? EMPTY : formatBmi(latestBmi),
      history: history((item) => [calculateBmi(item.weight, item.height)], (item) => formatBmi(calculateBmi(item.weight, item.height))),
    },
    // Optional Additional Measurement: listed only when the latest visit has it.
    ...(hasVitalValue(record.fbs)
      ? [{ key: "fbs", label: "FBS", unit: "mg/dL", display: shown(record.fbs), history: single("fbs") }]
      : []),
  ];

  return { record, recordedAt: getVitalRecordDate(record), rows };
}

/** Relative mini-chart: equally spaced recorded visits, with shared BP scaling.
 * Gaps break a line; a single reading remains one point; flat values stay flat.
 */
export function buildVitalTrendPlot(history = []) {
  const values = history.flatMap((point) => point.values).filter(Number.isFinite);
  if (!values.length) return { points: [], lines: [] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = history.map((point, index) => ({
    ...point,
    x: history.length === 1 ? 50 : 6 + (index * 88) / (history.length - 1),
    ys: point.values.map((value) => !Number.isFinite(value) ? null : max === min ? 50 : 82 - ((value - min) / (max - min)) * 64),
  }));
  const lines = [];
  const count = Math.max(...points.map((point) => point.ys.length));
  for (let seriesIndex = 0; seriesIndex < count; seriesIndex += 1) {
    let segment = [];
    const finish = () => {
      if (segment.length > 1) lines.push({ seriesIndex, points: segment });
      segment = [];
    };
    for (const point of points) {
      const y = point.ys[seriesIndex];
      if (y === null || y === undefined) finish();
      else segment.push({ x: point.x, y });
    }
    finish();
  }
  return { points, lines };
}
