import { calculateBmi, formatBmi, getBmiCategory } from "./bmi.js";
import { getRecordDateValue } from "./healthRecordPrograms.js";

/**
 * Adult WHO category, withheld under 18. A missing or non-numeric age is
 * treated as adult, matching summarizeLatestBmi.
 */
export function nutritionBmiCategory(bmi, age) {
  if (bmi === null || bmi === undefined || Number.isNaN(Number(bmi))) return "";
  const numericAge = Number.parseFloat(String(age ?? "").trim());
  if (Number.isFinite(numericAge) && numericAge < 18) return "";
  return getBmiCategory(Number(bmi));
}

function measurement(value) {
  if (typeof value === "number") return value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const match = value.match(/^\s*[+-]?(?:\d+\.?\d*|\.\d+)/);
  if (!match) return null;
  const number = Number(match[0]);
  return number > 0 ? number : null;
}

function reading(record, key) {
  const vitals = record?.vitalSigns || record?.vital_signs;
  if (vitals && typeof vitals === "object") {
    const fromVitals = measurement(vitals[key]);
    if (fromVitals !== null) return fromVitals;
  }
  return measurement(record?.[key]);
}

function dateRecorded(record) {
  const match = String(getRecordDateValue(record) || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

/**
 * Weight / height / BMI rows for one Nutrition episode.
 * `today` does not end an open episode — only `closedOn` does.
 * Rows are deduped by record id; the earliest dated copy wins.
 */
export function nutritionMeasurementHistory(records = [], { startedOn = "", closedOn = "", age } = {}) {
  const sorted = (Array.isArray(records) ? records : []).filter(Boolean).sort((a, b) => {
    const byDate = dateRecorded(a).localeCompare(dateRecorded(b));
    if (byDate !== 0) return byDate;
    return Number(a.id) - Number(b.id);
  });

  const seen = new Set();
  const history = [];
  for (const record of sorted) {
    const id = record.id ?? record.health_record_id;
    if (id === undefined || id === null || seen.has(String(id))) continue;

    const day = dateRecorded(record);
    if (!day || (startedOn && day < startedOn) || (closedOn && day > closedOn)) continue;

    const weightKg = reading(record, "weight");
    const heightCm = reading(record, "height");
    if (weightKg === null && heightCm === null) continue;

    seen.add(String(id));
    const bmi = weightKg !== null && heightCm !== null ? calculateBmi(weightKg, heightCm) : null;
    history.push({
      healthRecordId: id,
      dateRecorded: day,
      weightKg,
      heightCm,
      bmi,
      bmiCategory: bmi === null ? "" : nutritionBmiCategory(bmi, age),
    });
  }
  return history;
}

export function summarizeNutritionHistory(history = []) {
  let weightKg = null;
  let heightCm = null;
  let bmi = null;
  let bmiCategory = "";
  let lastVisit = "";
  for (const row of history) {
    if (row?.dateRecorded) lastVisit = row.dateRecorded;
    if (row?.weightKg !== null && row?.weightKg !== undefined) weightKg = row.weightKg;
    if (row?.heightCm !== null && row?.heightCm !== undefined) heightCm = row.heightCm;
    if (row?.bmi !== null && row?.bmi !== undefined) {
      bmi = row.bmi;
      bmiCategory = row.bmiCategory || "";
    }
  }
  return { weightKg, heightCm, bmi, bmiCategory, lastVisit };
}

function own(source, snake, camel) {
  if (source && Object.prototype.hasOwnProperty.call(source, snake)) return source[snake];
  if (source && Object.prototype.hasOwnProperty.call(source, camel)) return source[camel];
  return undefined;
}

export function nutritionHistoryFromApi(nutritionCare = {}) {
  const rows = nutritionCare.measurementHistory || nutritionCare.measurement_history || [];
  const seen = new Set();
  const history = [];
  for (const row of rows) {
    const id = row?.healthRecordId ?? row?.health_record_id;
    if (id === undefined || id === null || seen.has(String(id))) continue;
    seen.add(String(id));
    const day = String(row.dateRecorded || row.date_recorded || "");
    history.push({
      healthRecordId: id,
      dateRecorded: day.slice(0, 10),
      weightKg: row.weightKg ?? row.weight_kg ?? null,
      heightCm: row.heightCm ?? row.height_cm ?? null,
      bmi: row.bmi ?? null,
      bmiCategory: row.bmiCategory || row.bmi_category || "",
    });
  }
  return history;
}

export function nutritionReadingsFromApi(nutritionCare = {}) {
  return {
    weightKg: own(nutritionCare, "latest_weight_kg", "latestWeightKg") ?? null,
    heightCm: own(nutritionCare, "latest_height_cm", "latestHeightCm") ?? null,
    bmi: own(nutritionCare, "latest_bmi", "latestBmi") ?? null,
    bmiCategory: own(nutritionCare, "latest_bmi_category", "latestBmiCategory") || "",
  };
}

function amount(value, unit) {
  if (value === null || value === undefined || value === "") return "—";
  return `${value} ${unit}`;
}

function bmiText(bmi, category) {
  if (bmi === null || bmi === undefined || bmi === "") return "—";
  const value = formatBmi(Number(bmi));
  return category ? `${value} ${category}` : value;
}

export function nutritionCareFacts({ enrolledOn, weightKg, heightCm, bmi, bmiCategory } = {}) {
  return [
    { label: "Enrollment Date", value: enrolledOn || "—", type: "date" },
    { label: "Latest Weight", value: amount(weightKg, "kg"), type: "text" },
    { label: "Latest Height/Length", value: amount(heightCm, "cm"), type: "text" },
    { label: "Latest BMI", value: bmiText(bmi, bmiCategory), type: "text" },
  ];
}
