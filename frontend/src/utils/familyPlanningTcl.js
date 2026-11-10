import { isDateInReportPeriod } from "./bhcReporting.js";
import {
  formatFpClientTypeLabel,
  normalizeFpClientTypeCode,
} from "./familyPlanning.js";
import {
  getRecordDateValue,
  isFamilyPlanningRecord,
} from "./healthRecordPrograms.js";
import { normalizeDateValue } from "./filterUtils.js";
import { formatPatientName } from "./formatters.js";
import { patientBirthDate } from "./infantVisibility.js";
import { calculateAgeInYears } from "./maternalRisk.js";

export const FP_TCL_UNAVAILABLE = "Not recorded";

function getFamilyPlanningData(record = {}) {
  return record.familyPlanningData || record.family_planning_data || {};
}

function getPatientId(record = {}) {
  return String(
    record.patientId ||
      record.patient_id ||
      record.patient?.id ||
      record.patient?.patientId ||
      "",
  ).trim();
}

function getRecordId(record = {}) {
  return String(
    record.id ||
      record.healthRecordId ||
      record.health_record_id ||
      record.recordId ||
      record.record_id ||
      "",
  ).trim();
}

function asPatient(value) {
  return value && typeof value === "object" ? value : {};
}

function firstFilled(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function compareVisitDate(a, b) {
  const dateA = normalizeDateValue(getRecordDateValue(a)) || "";
  const dateB = normalizeDateValue(getRecordDateValue(b)) || "";
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  return getRecordId(a).localeCompare(getRecordId(b));
}

/** Explicit FP registration date only — never invent from visit date. */
function getFpDateRegistered(record = {}) {
  const data = getFamilyPlanningData(record);
  return (
    normalizeDateValue(
      data.dateRegistered ||
        data.date_registered ||
        record.dateRegistered ||
        record.date_registered,
    ) || ""
  );
}

function resolvePatient(patientId, record, patientMap) {
  const fromMap = patientMap.get(patientId);
  const fromRecord = asPatient(record.patient);
  return { ...(fromRecord || {}), ...(fromMap || {}), id: patientId };
}

/** Map stored NHTS values to SE Status labels; unknown stays empty for Not recorded. */
export function formatFpSeStatus(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[_]+/g, "-");
  if (!raw) return "";
  if (raw === "nhts" || raw === "1" || raw === "1-nhts" || raw.startsWith("1 —")) {
    return "1 — NHTS";
  }
  if (
    raw === "non-nhts" ||
    raw === "nonnhts" ||
    raw === "2" ||
    raw === "2-non-nhts" ||
    raw.startsWith("2 —")
  ) {
    return "2 — Non-NHTS";
  }
  return "";
}

function ageAsOfDate(period, latestVisit) {
  return (
    normalizeDateValue(getRecordDateValue(latestVisit)) ||
    normalizeDateValue(period?.end) ||
    normalizeDateValue(period?.start) ||
    ""
  );
}

/**
 * One TCL client row per patient with at least one FP visit in the report period.
 * Latest period visit supplies client type, method used, and previous method.
 * Date of registration uses the earliest explicit FP registration date only.
 */
export function buildFamilyPlanningTclRows({
  records = [],
  patients = [],
  period,
} = {}) {
  const patientMap = new Map(
    (Array.isArray(patients) ? patients : [])
      .map((patient) => [String(patient?.id || patient?.patientId || "").trim(), patient])
      .filter(([id]) => id),
  );

  const fpRecords = (Array.isArray(records) ? records : []).filter(
    isFamilyPlanningRecord,
  );
  const periodVisits = fpRecords.filter((record) =>
    isDateInReportPeriod(getRecordDateValue(record), period),
  );

  const periodByPatient = new Map();
  for (const record of periodVisits) {
    const patientId = getPatientId(record);
    if (!patientId) continue;
    if (!periodByPatient.has(patientId)) periodByPatient.set(patientId, []);
    periodByPatient.get(patientId).push(record);
  }

  const historyByPatient = new Map();
  for (const record of fpRecords) {
    const patientId = getPatientId(record);
    if (!patientId || !periodByPatient.has(patientId)) continue;
    if (!historyByPatient.has(patientId)) historyByPatient.set(patientId, []);
    historyByPatient.get(patientId).push(record);
  }

  const rows = [];
  for (const [patientId, visits] of periodByPatient) {
    const sortedVisits = [...visits].sort(compareVisitDate);
    const latest = sortedVisits[sortedVisits.length - 1];
    const history = historyByPatient.get(patientId) || visits;
    const patient = resolvePatient(patientId, latest, patientMap);
    const data = getFamilyPlanningData(latest);

    const registeredDates = history
      .map((record) => getFpDateRegistered(record))
      .filter(Boolean)
      .sort();
    const dateRegistered = registeredDates[0] || "";

    const clientTypeRaw = firstFilled(data.clientType, data.client_type);
    const methodRaw = firstFilled(data.methodUsed, data.method_used);
    const previousMethodRaw = firstFilled(data.previousMethod, data.previous_method);
    const dateOfBirth = normalizeDateValue(patientBirthDate(patient)) || "";
    const ageReference = ageAsOfDate(period, latest);
    const ageYears = dateOfBirth
      ? calculateAgeInYears(dateOfBirth, ageReference || undefined)
      : null;
    const ageDisplay =
      ageYears === null || ageYears === undefined || Number.isNaN(Number(ageYears))
        ? ""
        : String(ageYears);

    rows.push({
      key: patientId,
      patientId,
      dateRegistered,
      familySerialNumber: firstFilled(
        patient.familySerialNumber,
        patient.family_serial_number,
        latest.familySerialNumber,
        latest.family_serial_number,
      ),
      patientName: formatPatientName(patient, FP_TCL_UNAVAILABLE),
      age: ageDisplay,
      dateOfBirth,
      seStatus: formatFpSeStatus(
        firstFilled(patient.nhtsStatus, patient.nhts_status, latest.nhtsStatus, latest.nhts_status),
      ),
      clientType: formatFpClientTypeLabel(clientTypeRaw),
      clientTypeCode: normalizeFpClientTypeCode(clientTypeRaw),
      methodUsed: methodRaw,
      previousMethod: previousMethodRaw,
      visitCountInPeriod: visits.length,
      canViewPatient: Boolean(patientId),
    });
  }

  return rows.sort((a, b) => {
    const nameCmp = String(a.patientName).localeCompare(String(b.patientName));
    if (nameCmp !== 0) return nameCmp;
    return String(a.patientId).localeCompare(String(b.patientId));
  });
}

export function filterFamilyPlanningTclRows(
  rows = [],
  { search = "", clientType = "all" } = {},
) {
  const searchLower = String(search || "").trim().toLowerCase();
  const clientFilter = String(clientType || "all").trim().toLowerCase();

  return rows.filter((row) => {
    if (clientFilter && clientFilter !== "all") {
      const code = String(row.clientTypeCode || "").toLowerCase();
      if (clientFilter === "unknown") {
        if (code) return false;
      } else if (code !== clientFilter) {
        return false;
      }
    }

    if (!searchLower) return true;
    const haystack = [
      row.patientName,
      row.familySerialNumber,
      row.methodUsed,
      row.previousMethod,
      row.seStatus,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchLower);
  });
}

export function tclDisplayValue(value, fallback = FP_TCL_UNAVAILABLE) {
  const text = String(value ?? "").trim();
  return text || fallback;
}
