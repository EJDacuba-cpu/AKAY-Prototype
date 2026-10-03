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
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

/** The last TREND_LENGTH numeric readings, oldest first; [] under 2 points. */
function trend(ordered, read) {
  const values = ordered.map(read).filter((value) => value !== null);
  return values.length < 2 ? [] : values.slice(-TREND_LENGTH);
}

function shown(value) {
  return hasVitalValue(value) ? String(value).trim() : EMPTY;
}

/**
 * @returns {{ record: object|null, recordedAt: Date|null,
 *   rows: { key: string, label: string, unit: string, display: string, series: number[][] }[] }}
 */
export function buildVitalRows(records) {
  const list = Array.isArray(records) ? records : [];
  const record = getLatestVitalRecord(list);
  if (!record) return { record: null, recordedAt: null, rows: [] };

  const ordered = list
    .map((item) => ({ item, date: item ? getVitalRecordDate(item) : null }))
    .filter(({ date }) => date)
    .sort((a, b) => a.date - b.date)
    .map(({ item }) => item);

  const systolic = trend(ordered, (item) => toNumber(item.systolicBp));
  const diastolic = trend(ordered, (item) => toNumber(item.diastolicBp));
  const hasBp = hasVitalValue(record.systolicBp) || hasVitalValue(record.diastolicBp);
  const latestBmi = calculateBmi(record.weight, record.height);
  const single = (field) => trend(ordered, (item) => toNumber(item[field]));
  const wrap = (series) => (series.length ? [series] : []);

  const rows = [
    {
      key: "bp",
      label: "BP",
      unit: "mmHg",
      display: hasBp ? `${shown(record.systolicBp)}/${shown(record.diastolicBp)}` : EMPTY,
      series: systolic.length && diastolic.length ? [systolic, diastolic] : [],
    },
    ...SINGLE_VITALS.map(({ field, ...meta }) => ({
      ...meta,
      display: shown(record[field]),
      series: wrap(single(field)),
    })),
    {
      key: "bmi",
      label: "BMI",
      unit: "kg/m²",
      display: latestBmi === null ? EMPTY : formatBmi(latestBmi),
      series: wrap(trend(ordered, (item) => calculateBmi(item.weight, item.height))),
    },
    // Optional Additional Measurement: listed only when the latest visit has it.
    ...(hasVitalValue(record.fbs)
      ? [{ key: "fbs", label: "FBS", unit: "mg/dL", display: shown(record.fbs), series: wrap(single("fbs")) }]
      : []),
  ];

  return { record, recordedAt: getVitalRecordDate(record), rows };
}
