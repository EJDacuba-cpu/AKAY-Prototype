import { getRecordDateValue, getTbData } from "./healthRecordPrograms.js";
import { getVitalRecordDate, hasVitalValue } from "./currentPatientVitals.js";

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

function datedRecords(records = []) {
  return (records || [])
    .map((record, index) => ({ record, index, date: visitDate(record) }))
    .filter((item) => item.date)
    .sort((a, b) => a.date - b.date || a.index - b.index);
}

function pointMeta(item) {
  return {
    recordId: item.record.id ?? null,
    date: item.date,
    dateLabel: getRecordDateValue(item.record) || item.date.toISOString().slice(0, 10),
  };
}

export function bloodPressureTrendPoints(records = []) {
  return datedRecords(records).flatMap((item) => {
    const systolic = toNumber(item.record.systolicBp ?? item.record.systolic_bp);
    const diastolic = toNumber(item.record.diastolicBp ?? item.record.diastolic_bp);
    if (systolic === null && diastolic === null) return [];
    return [{ ...pointMeta(item), systolic, diastolic, unit: "mmHg" }];
  });
}

export function fbsTrendPoints(records = []) {
  return datedRecords(records).flatMap((item) => {
    const value = toNumber(item.record.fbs);
    if (value === null) return [];
    const unit = String(item.record.fbsUnit || item.record.fbs_unit || "mg/dL").trim() || "mg/dL";
    return [{ ...pointMeta(item), value, unit }];
  });
}

export function tbAdherenceTrendPoints(records = []) {
  return datedRecords(records).flatMap((item) => {
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

export function latestLabeledValue(points, read, unit) {
  const last = (points || []).at(-1);
  if (!last) return "";
  const value = read(last);
  return value === null || value === undefined || value === "" ? "" : `${value} ${unit}`.trim();
}
