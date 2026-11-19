import { getRecordDateValue, getTbData } from "./healthRecordPrograms.js";
import { getVitalRecordDate } from "./currentPatientVitals.js";

export const TREND_WINDOW_ALL = "all";
export const TREND_WINDOW_OPTIONS = Object.freeze([
  { value: TREND_WINDOW_ALL, label: "All Visits" },
  { value: 5, label: "Last 5" },
  { value: 10, label: "Last 10" },
]);

function toNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function visitDate(record) {
  return getVitalRecordDate(record) || (getRecordDateValue(record) ? new Date(`${getRecordDateValue(record)}T00:00:00+08:00`) : null);
}

function visitTimeLabel(record, date) {
  const raw = String(record?.timeOfVisit || record?.time_of_visit || "").trim();
  if (/^\d{1,2}:\d{2}/.test(raw)) return raw.slice(0, 5);
  if (!date) return "";
  const hours = date.getHours();
  const minutes = date.getMinutes();
  if (hours === 0 && minutes === 0) {
    // Date-only values are normalized to midnight; omit a misleading 00:00.
    const stamped = String(record?.dateRecorded || record?.date_recorded || "").trim();
    if (!stamped || /^\d{4}-\d{2}-\d{2}$/.test(stamped)) return "";
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function recordKey(record, index) {
  const id = record?.id ?? record?.healthRecordId ?? record?.health_record_id;
  return id === null || id === undefined || id === "" ? `index:${index}` : String(id);
}

/** Chronological records with a visit date, deduped by health record id. */
function datedRecords(records = []) {
  const seen = new Set();
  return (records || [])
    .map((record, index) => ({ record, index, date: visitDate(record), key: recordKey(record, index) }))
    .filter((item) => {
      if (!item.date) return false;
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    })
    .sort((a, b) => a.date - b.date || a.index - b.index);
}

function withDayLabels(items) {
  const dayCounts = new Map();
  for (const item of items) {
    const day = getRecordDateValue(item.record) || item.date.toISOString().slice(0, 10);
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
  }
  const dayIndex = new Map();
  return items.map((item) => {
    const day = getRecordDateValue(item.record) || item.date.toISOString().slice(0, 10);
    const index = dayIndex.get(day) || 0;
    dayIndex.set(day, index + 1);
    const timeLabel = visitTimeLabel(item.record, item.date);
    const sameDayCount = dayCounts.get(day) || 1;
    let dateLabel = day;
    if (sameDayCount > 1) {
      dateLabel = timeLabel ? `${day} ${timeLabel}` : `${day} · ${index + 1}`;
    }
    return {
      ...item,
      day,
      timeLabel,
      dateLabel,
      sameDayIndex: index,
      sameDayCount,
    };
  });
}

function pointMeta(item) {
  return {
    recordId: item.record.id ?? null,
    date: item.date,
    day: item.day,
    timeLabel: item.timeLabel || "",
    dateLabel: item.dateLabel,
    tooltipLabel: item.timeLabel ? `${item.day} · ${item.timeLabel}` : item.day,
  };
}

export function bloodPressureTrendPoints(records = []) {
  return withDayLabels(datedRecords(records)).flatMap((item) => {
    const systolic = toNumber(item.record.systolicBp ?? item.record.systolic_bp);
    const diastolic = toNumber(item.record.diastolicBp ?? item.record.diastolic_bp);
    if (systolic === null && diastolic === null) return [];
    return [{ ...pointMeta(item), systolic, diastolic, unit: "mmHg" }];
  });
}

export function fbsTrendPoints(records = []) {
  return withDayLabels(datedRecords(records)).flatMap((item) => {
    const value = toNumber(item.record.fbs);
    if (value === null) return [];
    const unit = String(item.record.fbsUnit || item.record.fbs_unit || "mg/dL").trim() || "mg/dL";
    return [{ ...pointMeta(item), value, unit }];
  });
}

/** Plot only readings that share the latest recorded unit; never convert. */
export function fbsChartPoints(records = []) {
  const points = fbsTrendPoints(records);
  const unit = points.at(-1)?.unit;
  return unit ? points.filter((point) => point.unit === unit) : points;
}

export function tbAdherenceTrendPoints(records = []) {
  return withDayLabels(datedRecords(records)).flatMap((item) => {
    const tb = getTbData(item.record);
    const raw = tb.raw?.doseCalendar?.adherencePercent;
    if (raw === null || raw === undefined || String(raw).trim() === "") return [];
    const adherencePercent = toNumber(raw);
    if (adherencePercent === null) return [];
    return [{
      ...pointMeta(item),
      adherencePercent,
      tbCaseNumber: tb.tbCaseNumber || "",
    }];
  });
}

function dispensedMedicineLines(record = {}) {
  const medicines =
    record.dispensedMedicines ||
    record.dispensed_medicines ||
    record.healthRecordMedicines ||
    record.health_record_medicines ||
    record.itemsPlanned ||
    record.items_planned ||
    [];
  return Array.isArray(medicines) ? medicines.filter(Boolean) : [];
}

function medicineLineQuantity(line = {}) {
  const qty = toNumber(line.quantity ?? line.qty ?? line.authorizedQuantity ?? line.authorized_quantity);
  return qty === null ? 0 : qty;
}

function medicineLineLabel(line = {}) {
  return String(
    line.medicineName ||
      line.medicine_name ||
      line.name ||
      line.itemDescription ||
      line.item_description ||
      "",
  ).trim();
}

/**
 * One point per dated TB visit: total dispensed medicine quantity that visit.
 * Visits without dispense stay on the chart at 0 so follow-ups are still visible.
 */
export function tbDispenseTrendPoints(records = []) {
  return withDayLabels(datedRecords(records)).map((item) => {
    const lines = dispensedMedicineLines(item.record);
    const quantityDispensed = lines.reduce((sum, line) => sum + medicineLineQuantity(line), 0);
    const medicineLabels = lines
      .map((line) => {
        const name = medicineLineLabel(line);
        const qty = medicineLineQuantity(line);
        const unit = String(line.unit || "").trim();
        if (!name) return "";
        return [name, qty ? `${qty}${unit ? ` ${unit}` : ""}` : ""].filter(Boolean).join(" × ");
      })
      .filter(Boolean);
    const tb = getTbData(item.record);
    return {
      ...pointMeta(item),
      quantityDispensed,
      medicineLabels,
      medicineSummary: medicineLabels.length ? medicineLabels.join("; ") : "No medicines dispensed",
      tbCaseNumber: tb.tbCaseNumber || "",
      hasDispense: quantityDispensed > 0 || lines.length > 0,
    };
  });
}

/** Keep chronological order; optionally keep only the latest N plotted points. */
export function limitTrendPoints(points = [], window = TREND_WINDOW_ALL) {
  const list = Array.isArray(points) ? points : [];
  if (window === TREND_WINDOW_ALL || window == null || window === "") return list;
  const count = Number(window);
  if (!Number.isFinite(count) || count <= 0) return list;
  return list.slice(Math.max(0, list.length - count));
}

export function latestLabeledValue(points, read, unit) {
  const last = (points || []).at(-1);
  if (!last) return "";
  const value = read(last);
  return value === null || value === undefined || value === "" ? "" : `${value} ${unit}`.trim();
}
