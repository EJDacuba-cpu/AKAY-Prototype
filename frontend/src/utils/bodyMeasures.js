import { summarizeLatestBmi } from "./bmi.js";
import { getVitalRecordDate } from "./currentPatientVitals.js";

/**
 * Height, weight and BMI for the profile's body figure: the latest recorded
 * height (from whichever visit last measured it), the last few weights with
 * the change since the previous reading, and the latest BMI (one visit with
 * both measurements - see summarizeLatestBmi). Values only: nothing here says
 * whether a weight or a change is good or bad.
 */
export const WEIGHT_HISTORY_LENGTH = 5;

function toNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** Records with a date, oldest first. */
function chronological(records) {
  return (Array.isArray(records) ? records : [])
    .filter(Boolean)
    .map((record) => ({ record, date: getVitalRecordDate(record) }))
    .filter(({ date }) => date)
    .sort((a, b) => a.date - b.date);
}

/** Readings of one field, oldest first, skipping blanks and non-numbers. */
function readings(ordered, field) {
  return ordered
    .map(({ record, date }) => ({ value: toNumber(record[field]), date }))
    .filter(({ value }) => value !== null);
}

function trimNumber(value) {
  return String(Math.round(value * 10) / 10);
}

function signed(value) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${trimNumber(Math.abs(value))}`;
}

/**
 * @returns {{
 *   height: { value: number, display: string, date: Date } | null,
 *   weight: { latest: { value: number, date: Date }, history: { value: number, date: Date }[],
 *     change: { value: number, display: string, since: Date } | null } | null,
 *   bmi: { value: string, category: string, date: Date | null } | null,
 * }}
 */
export function buildBodyMeasures(records, age) {
  const ordered = chronological(records);

  const heights = readings(ordered, "height");
  const lastHeight = heights[heights.length - 1];
  const height = lastHeight ? { ...lastHeight, display: trimNumber(lastHeight.value) } : null;

  const weights = readings(ordered, "weight");
  let weight = null;
  if (weights.length) {
    const latest = weights[weights.length - 1];
    const previous = weights[weights.length - 2];
    const delta = previous ? Math.round((latest.value - previous.value) * 10) / 10 : null;
    weight = {
      latest,
      history: weights.slice(-WEIGHT_HISTORY_LENGTH),
      change: previous ? { value: delta, display: signed(delta), since: previous.date } : null,
    };
  }

  return { height, weight, bmi: summarizeLatestBmi(records, age) };
}
