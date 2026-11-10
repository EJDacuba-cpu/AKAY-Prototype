import { isDateInReportPeriod } from "./bhcReporting.js";
import { POSTPARTUM_WINDOW_DAYS } from "./careTrackingConfig.js";
import { getRecordDateValue, isMaternalRecord } from "./healthRecordPrograms.js";
import { normalizeDateValue } from "./filterUtils.js";
import { formatPatientName } from "./formatters.js";
import { patientBirthDate } from "./infantVisibility.js";
import { calculateAgeInYears } from "./maternalRisk.js";

export const MATERNAL_TCL_UNAVAILABLE = "Not recorded";

function getMaternalData(record = {}) {
  return record.maternalData || record.maternal_data || {};
}

function getMonitoringData(record = {}) {
  return record.monitoringData || record.monitoring_data || {};
}

function getVisitPurposeServices(record = {}) {
  const purpose = getMonitoringData(record).visitPurpose || {};
  return Array.isArray(purpose.services) ? purpose.services : [];
}

/** True when the visit is postpartum-focused (excludes pure prenatal and unlabeled legacy). */
export function isPostpartumMaternalVisit(record = {}) {
  return getVisitPurposeServices(record).includes("Postpartum");
}

/** Prenatal-oriented maternal visits: Prenatal purpose, mixed with Prenatal, or legacy unlabeled. */
export function isPrenatalMaternalVisit(record = {}) {
  if (!isMaternalRecord(record)) return false;
  const services = getVisitPurposeServices(record);
  // Postpartum-only visits are excluded from the prenatal consultation count.
  if (services.includes("Postpartum") && !services.includes("Prenatal")) return false;
  return true;
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

function toDate(value) {
  const iso = normalizeDateValue(value);
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function compareVisitDate(a, b) {
  const dateA = normalizeDateValue(getRecordDateValue(a)) || "";
  const dateB = normalizeDateValue(getRecordDateValue(b)) || "";
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  return getRecordId(a).localeCompare(getRecordId(b));
}

function resolvePatient(patientId, record, patientMap) {
  const fromMap = patientMap.get(patientId);
  const fromRecord = asPatient(record.patient);
  return { ...(fromRecord || {}), ...(fromMap || {}), id: patientId };
}

/**
 * Split maternal records into pregnancy episodes using the same delivery + 42-day
 * boundary as Care Tracking. Without delivery dates, records stay in one episode
 * (conservative fallback — no invented pregnancy IDs).
 */
export function splitMaternalEpisodes(maternalRecords = []) {
  const sorted = [...(Array.isArray(maternalRecords) ? maternalRecords : [])].sort(compareVisitDate);
  if (!sorted.length) return [];

  const episodes = [];
  let current = [];
  let deliveryDate = null;

  for (const record of sorted) {
    const data = getMaternalData(record);
    const services = getVisitPurposeServices(record);
    const recordDate = toDate(getRecordDateValue(record));
    const recordDelivery = toDate(data.deliveryDate || data.delivery_date);
    const isPostpartumVisit = services.includes("Postpartum");
    const isPrenatalVisit = services.includes("Prenatal") || services.length === 0;

    if (deliveryDate && isPrenatalVisit && !isPostpartumVisit) {
      const windowEnd = addDays(deliveryDate, POSTPARTUM_WINDOW_DAYS);
      if (recordDate && recordDate > windowEnd) {
        if (current.length) episodes.push(current);
        current = [];
        deliveryDate = null;
      }
    }

    current.push(record);

    if (recordDelivery) {
      deliveryDate = recordDelivery;
    }
  }

  if (current.length) episodes.push(current);
  return episodes;
}

function collectDatedTetanusDoses(maternalRecords = []) {
  const tt = { tt1: "", tt2: "", tt3: "", tt4: "", tt5: "" };
  const td = { td1: "", td2: "", td3: "", td4: "", td5: "" };

  for (const record of maternalRecords) {
    const data = getMaternalData(record);
    const ttStatus = data.tetanusToxoidStatus || data.tetanus_toxoid_status || {};
    const tdStatus = data.tetanusDiphtheriaStatus || data.tetanus_diphtheria_status || {};
    for (const key of Object.keys(tt)) {
      if (!tt[key]) tt[key] = normalizeDateValue(ttStatus[key]) || "";
    }
    for (const key of Object.keys(td)) {
      if (!td[key]) td[key] = normalizeDateValue(tdStatus[key]) || "";
    }
  }

  return { tt, td };
}

function highestCompletedDose(doses, prefix) {
  const keys = [`${prefix}5`, `${prefix}4`, `${prefix}3`, `${prefix}2`, `${prefix}1`];
  for (const key of keys) {
    const date = normalizeDateValue(doses[key]);
    if (date) return { key: key.toUpperCase(), date };
  }
  return null;
}

/** Latest documented formulation+dose only (TT and Td stay separate). Never claims CPAB. */
export function formatMaternalTtTdDisplay(maternalRecords = []) {
  const { tt, td } = collectDatedTetanusDoses(maternalRecords);
  const ttDose = highestCompletedDose(tt, "tt");
  const tdDose = highestCompletedDose(td, "td");

  const parts = [];
  if (ttDose) parts.push(ttDose.key);
  if (tdDose) {
    // Display Td not TD for UI consistency with encoding labels.
    parts.push(tdDose.key.replace(/^TD/, "Td"));
  }
  return parts.join(" · ");
}

export function formatGravidaPara(data = {}) {
  const gravida = String(data.gravida ?? "").trim();
  const para = String(data.para ?? "").trim();
  if (!gravida && !para) return "";
  if (gravida && para) return `G${gravida}P${para}`;
  if (gravida) return `G${gravida}`;
  return `P${para}`;
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
 * One TCL row per pregnancy episode that has ≥1 maternal visit in the report period.
 * Episode boundaries follow Care Tracking (delivery + 42 days). Without delivery
 * evidence, all maternal visits for a patient collapse to one conservative row.
 */
export function buildMaternalCareTclRows({
  records = [],
  patients = [],
  period,
} = {}) {
  const patientMap = new Map(
    (Array.isArray(patients) ? patients : [])
      .map((patient) => [String(patient?.id || patient?.patientId || "").trim(), patient])
      .filter(([id]) => id),
  );

  const maternalRecords = (Array.isArray(records) ? records : []).filter(isMaternalRecord);
  const byPatient = new Map();
  for (const record of maternalRecords) {
    const patientId = getPatientId(record);
    if (!patientId) continue;
    if (!byPatient.has(patientId)) byPatient.set(patientId, []);
    byPatient.get(patientId).push(record);
  }

  const rows = [];
  for (const [patientId, patientRecords] of byPatient) {
    const historical = patientRecords.filter((record) => {
      const date = normalizeDateValue(getRecordDateValue(record));
      return date && (!period?.end || date <= period.end);
    });
    if (!historical.length) continue;

    const episodes = splitMaternalEpisodes(historical);
    for (const episode of episodes) {
      const periodVisits = episode.filter((record) =>
        isDateInReportPeriod(getRecordDateValue(record), period),
      );
      if (!periodVisits.length) continue;

      const sortedEpisode = [...episode].sort(compareVisitDate);
      const sortedPeriod = [...periodVisits].sort(compareVisitDate);
      const latest = sortedPeriod[sortedPeriod.length - 1];
      const patient = resolvePatient(patientId, latest, patientMap);
      // Prefer the newest documented obstetric values in the episode (do not invent).
      const newestFirst = [...sortedEpisode].reverse();
      const gravida = firstFilled(...newestFirst.map((record) => getMaternalData(record).gravida));
      const para = firstFilled(...newestFirst.map((record) => getMaternalData(record).para));
      const lmp = firstFilled(
        ...newestFirst.flatMap((record) => [getMaternalData(record).lmp, record.lmp]),
      );
      const edc = firstFilled(
        ...newestFirst.flatMap((record) => {
          const data = getMaternalData(record);
          return [
            data.expectedDeliveryDate,
            data.expected_delivery_date,
            data.edc,
            record.expectedDeliveryDate,
            record.expected_delivery_date,
          ];
        }),
      );

      const registrationDates = sortedEpisode
        .map((record) => normalizeDateValue(getRecordDateValue(record)))
        .filter(Boolean)
        .sort();
      const dateRegistered = registrationDates[0] || "";

      const dateOfBirth = normalizeDateValue(patientBirthDate(patient)) || "";
      const ageReference = ageAsOfDate(period, latest);
      const ageYears = dateOfBirth
        ? calculateAgeInYears(dateOfBirth, ageReference || undefined)
        : null;
      const ageDisplay =
        ageYears === null || ageYears === undefined || Number.isNaN(Number(ageYears))
          ? ""
          : String(ageYears);

      const ttTd = formatMaternalTtTdDisplay(sortedEpisode);
      const ttTdFilterKey = ttTd
        ? ttTd.includes("TT") && ttTd.includes("Td")
          ? "both"
          : ttTd.includes("Td")
            ? "td"
            : "tt"
        : "none";

      rows.push({
        key: `${patientId}:${dateRegistered || getRecordId(latest)}`,
        patientId,
        dateRegistered,
        familySerialNumber: firstFilled(
          patient.familySerialNumber,
          patient.family_serial_number,
          latest.familySerialNumber,
          latest.family_serial_number,
        ),
        patientName: formatPatientName(patient, MATERNAL_TCL_UNAVAILABLE),
        age: ageDisplay,
        dateOfBirth,
        gravidaPara: formatGravidaPara({ gravida, para }),
        lmp,
        edc,
        ttTd,
        ttTdFilterKey,
        visitCountInPeriod: periodVisits.length,
        canViewPatient: Boolean(patientId),
      });
    }
  }

  return rows.sort((a, b) => {
    const nameCmp = String(a.patientName).localeCompare(String(b.patientName));
    if (nameCmp !== 0) return nameCmp;
    const regCmp = String(a.dateRegistered).localeCompare(String(b.dateRegistered));
    if (regCmp !== 0) return regCmp;
    return String(a.patientId).localeCompare(String(b.patientId));
  });
}

export function filterMaternalCareTclRows(
  rows = [],
  { search = "", ttTdFilter = "all" } = {},
) {
  const searchLower = String(search || "").trim().toLowerCase();
  const filter = String(ttTdFilter || "all").trim().toLowerCase();

  return rows.filter((row) => {
    if (filter && filter !== "all") {
      const key = String(row.ttTdFilterKey || "none").toLowerCase();
      if (filter === "none") {
        if (key !== "none") return false;
      } else if (filter === "tt") {
        if (key !== "tt" && key !== "both") return false;
      } else if (filter === "td") {
        if (key !== "td" && key !== "both") return false;
      } else if (key !== filter) {
        return false;
      }
    }

    if (!searchLower) return true;
    const haystack = [row.patientName, row.familySerialNumber, row.ttTd, row.gravidaPara]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchLower);
  });
}

export function tclDisplayValue(value, fallback = MATERNAL_TCL_UNAVAILABLE) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/**
 * Episode starts that fall in the report period (for New Enrollments KPI).
 * Without delivery boundaries this matches "first maternal record" per patient.
 */
export function countMaternalEpisodeStartsInPeriod(records = [], period) {
  const maternalRecords = (Array.isArray(records) ? records : []).filter(isMaternalRecord);
  const byPatient = new Map();
  for (const record of maternalRecords) {
    const patientId = getPatientId(record);
    if (!patientId) continue;
    if (!byPatient.has(patientId)) byPatient.set(patientId, []);
    byPatient.get(patientId).push(record);
  }

  let count = 0;
  for (const patientRecords of byPatient.values()) {
    const historical = patientRecords.filter((record) => {
      const date = normalizeDateValue(getRecordDateValue(record));
      return date && (!period?.end || date <= period.end);
    });
    for (const episode of splitMaternalEpisodes(historical)) {
      const start = [...episode]
        .map((record) => normalizeDateValue(getRecordDateValue(record)))
        .filter(Boolean)
        .sort()[0];
      if (isDateInReportPeriod(start, period)) count += 1;
    }
  }
  return count;
}

/** Maternal visits in period that are not postpartum-only. */
export function countPrenatalConsultationsInPeriod(records = [], period) {
  return (Array.isArray(records) ? records : [])
    .filter(isMaternalRecord)
    .filter((record) => isDateInReportPeriod(getRecordDateValue(record), period))
    .filter((record) => isPrenatalMaternalVisit(record)).length;
}
