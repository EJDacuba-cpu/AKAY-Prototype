/**
 * Nutrition Target Client List (BHC + RHU Reports → TCL → Nutrition).
 *
 * One row per enrolled patient for the period: latest qualifying finalized
 * nutrition assessment. No Last Visit column. View links live in the section.
 */
import { calculateBmi, formatBmi, getBmiCategory } from "./bmi.js";
import { normalizeDateValue } from "./filterUtils.js";
import { formatPatientName } from "./formatters.js";
import { getRecordDateValue } from "./healthRecordPrograms.js";
import { patientBirthDate } from "./infantVisibility.js";
import { calculateAgeInYears } from "./maternalRisk.js";
import { isNutritionEnrollmentRecord } from "./nutritionEnrollment.js";
import {
  matchesAgeGroup,
  normalizeNutritionAgeGroup,
  patientAgeYears,
} from "./nutritionReporting.js";

export const NUTRITION_TCL_UNAVAILABLE = "—";
export const NUTRITION_TCL_NOT_ASSESSED = "Not assessed";
export const NUTRITION_TCL_NA = "N/A";

const ADULT_BMI_MIN_AGE = 18;

function isDateInReportPeriod(value, period) {
  const date = normalizeDateValue(value);
  if (!date || !period?.start || !period?.end) return false;
  return date >= period.start && date <= period.end;
}

function isFinalizedRecord(record = {}) {
  const status = String(record.status || record.recordStatus || "").trim().toLowerCase();
  if (status === "draft" || record.isDraft === true || record.is_draft === true) return false;
  const finalized = record.finalizedAt ?? record.finalized_at;
  if (finalized === null || finalized === false || finalized === "") {
    return status !== "draft";
  }
  return true;
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

function recordDay(record) {
  return normalizeDateValue(getRecordDateValue(record)) || "";
}

function patientIdOf(record = {}) {
  return String(
    record.patientId
      || record.patient_id
      || record.patient?.id
      || record.patient?.patientId
      || "",
  ).trim();
}

function patientIdKey(patient = {}) {
  return String(patient.id || patient.patientId || patient.patient_id || "").trim();
}

function recordIdOf(record = {}) {
  return String(
    record.id
      || record.healthRecordId
      || record.health_record_id
      || record.recordId
      || "",
  ).trim();
}

function firstFilled(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function asPatient(value) {
  return value && typeof value === "object" ? value : {};
}

function resolvePatient(patientId, record, patientMap) {
  const fromMap = patientMap.get(patientId);
  const fromRecord = asPatient(record.patient);
  return { ...(fromRecord || {}), ...(fromMap || {}), id: patientId };
}

function isQualifyingAssessment(record) {
  if (!record || !isFinalizedRecord(record)) return false;
  if (isNutritionEnrollmentRecord(record)) return true;
  return reading(record, "weight") !== null || reading(record, "height") !== null;
}

function compareAssessment(a, b) {
  const dayA = recordDay(a);
  const dayB = recordDay(b);
  if (dayA !== dayB) return dayA.localeCompare(dayB);
  return Number(recordIdOf(a) || 0) - Number(recordIdOf(b) || 0);
}

function formatAgeLabel(ageYears) {
  if (ageYears === null || ageYears === undefined || Number.isNaN(Number(ageYears))) {
    return "";
  }
  const age = Math.floor(Number(ageYears));
  return `${age} ${age === 1 ? "yr" : "yrs"}`;
}

function formatSex(patient = {}) {
  return firstFilled(patient.sex, patient.gender, patient.Sex);
}

function classificationForAssessment({ ageAtAssessment, bmi }) {
  if (ageAtAssessment !== null && ageAtAssessment < ADULT_BMI_MIN_AGE) {
    return {
      bmiDisplay: NUTRITION_TCL_NA,
      classification: NUTRITION_TCL_NA,
    };
  }
  if (bmi === null) {
    return {
      bmiDisplay: NUTRITION_TCL_UNAVAILABLE,
      classification: NUTRITION_TCL_NOT_ASSESSED,
    };
  }
  return {
    bmiDisplay: formatBmi(bmi),
    classification: getBmiCategory(bmi) || NUTRITION_TCL_NOT_ASSESSED,
  };
}

/**
 * Enrolled Nutrition clients with a qualifying assessment in the period.
 * One row per patient; latest in-period assessment wins (date, then record id).
 */
export function buildNutritionTclRows({
  records = [],
  patients = [],
  period,
  ageGroup = "all",
} = {}) {
  if (!period?.start || !period?.end) return [];

  const group = normalizeNutritionAgeGroup(ageGroup);
  const asOf = period.end;
  const patientMap = new Map(
    (Array.isArray(patients) ? patients : [])
      .map((patient) => [patientIdKey(patient), patient])
      .filter(([id]) => id),
  );

  const enrolledIds = new Set();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || !isFinalizedRecord(record) || !isNutritionEnrollmentRecord(record)) continue;
    const day = recordDay(record);
    if (!day || day > asOf) continue;
    const pid = patientIdOf(record);
    if (!pid) continue;
    enrolledIds.add(pid);
  }

  const bestByPatient = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (!isQualifyingAssessment(record)) continue;
    const day = recordDay(record);
    if (!isDateInReportPeriod(day, period)) continue;
    const pid = patientIdOf(record);
    if (!pid || !enrolledIds.has(pid)) continue;

    const previous = bestByPatient.get(pid);
    if (!previous || compareAssessment(previous, record) < 0) {
      bestByPatient.set(pid, record);
    }
  }

  const rows = [];
  for (const [patientId, record] of bestByPatient.entries()) {
    const patient = resolvePatient(patientId, record, patientMap);
    if (!patientMap.has(patientId) && !record.patient) {
      // Facility list is the authority; skip unknown patients to avoid leakage.
      continue;
    }

    const assessmentDate = recordDay(record);
    const ageAtAssessment = patientAgeYears(patient, assessmentDate);
    if (!matchesAgeGroup(ageAtAssessment, group)) continue;

    const weightKg = reading(record, "weight");
    const heightCm = reading(record, "height");
    const bmi = weightKg !== null && heightCm !== null
      ? calculateBmi(weightKg, heightCm)
      : null;
    const { bmiDisplay, classification } = classificationForAssessment({
      ageAtAssessment,
      bmi,
    });

    const ageYearsFallback = calculateAgeInYears(patientBirthDate(patient), assessmentDate || asOf);

    rows.push({
      key: `nutrition-tcl:${patientId}`,
      patientId,
      patientName: formatPatientName(patient, NUTRITION_TCL_UNAVAILABLE),
      patientIdentifier: firstFilled(
        patient.familySerialNumber,
        patient.family_serial_number,
        patient.patientCode,
        patient.patient_code,
        patient.localId,
        patient.local_id,
      ),
      ageLabel: formatAgeLabel(
        ageAtAssessment !== null && ageAtAssessment !== undefined
          ? ageAtAssessment
          : ageYearsFallback,
      ),
      sex: formatSex(patient),
      assessmentDate,
      weightKg,
      heightCm,
      weightDisplay: weightKg !== null ? String(weightKg) : NUTRITION_TCL_UNAVAILABLE,
      heightDisplay: heightCm !== null ? String(heightCm) : NUTRITION_TCL_UNAVAILABLE,
      bmiDisplay,
      classification,
      canViewPatient: Boolean(patientId && patientMap.has(patientId)),
      recordId: recordIdOf(record),
    });
  }

  rows.sort((a, b) => {
    const nameCmp = String(a.patientName || "").localeCompare(String(b.patientName || ""), undefined, {
      sensitivity: "base",
    });
    if (nameCmp !== 0) return nameCmp;
    return String(a.patientId).localeCompare(String(b.patientId));
  });

  return rows;
}

export function filterNutritionTclRows(rows = [], { search = "" } = {}) {
  const searchLower = String(search || "").trim().toLowerCase();
  if (!searchLower) return Array.isArray(rows) ? [...rows] : [];

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const haystack = [
      row.patientName,
      row.patientIdentifier,
      row.patientId,
      row.classification,
      row.sex,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchLower);
  });
}

export function tclDisplayValue(value, fallback = NUTRITION_TCL_UNAVAILABLE) {
  const text = String(value ?? "").trim();
  return text || fallback;
}
