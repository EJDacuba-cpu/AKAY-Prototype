/**
 * BHC Nutrition Report metrics: adult BMI classifications for the period and
 * ever-enrolled coverage vs eligible registered population (age-filtered).
 */
import { calculateBmi, getBmiCategory } from "./bmi.js";
import { normalizeDateValue } from "./filterUtils.js";
import { getRecordDateValue } from "./healthRecordPrograms.js";
import { patientBirthDate } from "./infantVisibility.js";
import { calculateAgeInYears } from "./maternalRisk.js";
import { isNutritionEnrollmentRecord } from "./nutritionEnrollment.js";

function isDateInReportPeriod(value, period) {
  const date = normalizeDateValue(value);
  if (!date || !period?.start || !period?.end) return false;
  return date >= period.start && date <= period.end;
}

export const NUTRITION_BMI_CATEGORIES = Object.freeze([
  "Underweight",
  "Normal",
  "Overweight",
  "Obese",
]);

export const NUTRITION_AGE_GROUPS = Object.freeze([
  Object.freeze({ value: "all", label: "All Ages" }),
  Object.freeze({ value: "0-4", label: "0–4" }),
  Object.freeze({ value: "5-19", label: "5–19" }),
  Object.freeze({ value: "20+", label: "20+" }),
]);

const ADULT_BMI_MIN_AGE = 18;

export function normalizeNutritionAgeGroup(value) {
  const raw = String(value || "all").trim();
  return NUTRITION_AGE_GROUPS.some((item) => item.value === raw) ? raw : "all";
}

export function patientAgeYears(patient, asOfDate) {
  return calculateAgeInYears(patientBirthDate(patient), asOfDate || new Date());
}

/** Age group buckets: 0–4 (&lt;5), 5–19 (5–&lt;20), 20+ (≥20). */
export function matchesAgeGroup(ageYears, group = "all") {
  const key = normalizeNutritionAgeGroup(group);
  if (key === "all") return true;
  if (ageYears === null || ageYears === undefined || Number.isNaN(Number(ageYears))) return false;
  const age = Number(ageYears);
  if (key === "0-4") return age < 5;
  if (key === "5-19") return age >= 5 && age < 20;
  if (key === "20+") return age >= 20;
  return true;
}

function isFinalizedRecord(record = {}) {
  const status = String(record.status || record.recordStatus || "").trim().toLowerCase();
  if (status === "draft" || record.isDraft === true || record.is_draft === true) return false;
  const finalized = record.finalizedAt ?? record.finalized_at;
  // Official list payloads often omit finalized_at; treat missing as finalized
  // unless explicitly marked draft (same practical rule as report record lists).
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
      || "",
  );
}

function patientIdKey(patient = {}) {
  return String(patient.id || patient.patientId || patient.patient_id || "");
}

function emptyCategories() {
  return Object.fromEntries(
    NUTRITION_BMI_CATEGORIES.map((label) => [label, { count: 0, percent: 0 }]),
  );
}

/**
 * Latest paired weight+height in period per patient → adult BMI category or null.
 */
export function classifyPatientsInPeriod(patients, records, period, ageGroup = "all") {
  const patientMap = new Map(
    (Array.isArray(patients) ? patients : [])
      .map((patient) => [patientIdKey(patient), patient])
      .filter(([id]) => id),
  );

  const bestByPatient = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || !isFinalizedRecord(record)) continue;
    const day = recordDay(record);
    if (!isDateInReportPeriod(day, period)) continue;
    const pid = patientIdOf(record);
    if (!pid) continue;
    const patient = patientMap.get(pid);
    if (!patient) continue;

    const ageAtVisit = patientAgeYears(patient, day);
    if (!matchesAgeGroup(ageAtVisit, ageGroup)) continue;

    const weightKg = reading(record, "weight");
    const heightCm = reading(record, "height");
    const bmi = weightKg !== null && heightCm !== null ? calculateBmi(weightKg, heightCm) : null;
    const previous = bestByPatient.get(pid);
    if (!previous || day > previous.day || (day === previous.day && Number(record.id) > Number(previous.recordId || 0))) {
      bestByPatient.set(pid, {
        day,
        recordId: record.id,
        weightKg,
        heightCm,
        bmi,
        ageAtVisit,
      });
    }
  }

  const categories = emptyCategories();
  let classifiedCount = 0;
  let notApplicableCount = 0;
  let incompleteAdultCount = 0;

  for (const row of bestByPatient.values()) {
    const age = row.ageAtVisit;
    if (age !== null && age < ADULT_BMI_MIN_AGE) {
      notApplicableCount += 1;
      continue;
    }
    if (row.bmi === null) {
      incompleteAdultCount += 1;
      continue;
    }
    const label = getBmiCategory(row.bmi);
    if (!categories[label]) continue;
    categories[label].count += 1;
    classifiedCount += 1;
  }

  for (const label of NUTRITION_BMI_CATEGORIES) {
    categories[label].percent = classifiedCount
      ? Math.round((categories[label].count / classifiedCount) * 1000) / 10
      : 0;
  }

  return { categories, classifiedCount, notApplicableCount, incompleteAdultCount };
}

export function countEligiblePatients(patients, period, ageGroup = "all") {
  const asOf = period?.end || normalizeDateValue(new Date());
  let count = 0;
  for (const patient of Array.isArray(patients) ? patients : []) {
    const age = patientAgeYears(patient, asOf);
    if (!matchesAgeGroup(age, ageGroup)) continue;
    count += 1;
  }
  return count;
}

export function countEverEnrolledPatients(patients, records, period, ageGroup = "all") {
  const asOf = period?.end || normalizeDateValue(new Date());
  const patientMap = new Map(
    (Array.isArray(patients) ? patients : [])
      .map((patient) => [patientIdKey(patient), patient])
      .filter(([id]) => id),
  );
  const enrolled = new Set();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || !isFinalizedRecord(record) || !isNutritionEnrollmentRecord(record)) continue;
    const day = recordDay(record);
    if (!day || day > asOf) continue;
    const pid = patientIdOf(record);
    if (!pid || enrolled.has(pid)) continue;
    const patient = patientMap.get(pid);
    if (!patient) continue;
    if (!matchesAgeGroup(patientAgeYears(patient, asOf), ageGroup)) continue;
    enrolled.add(pid);
  }
  return enrolled.size;
}

export function buildNutritionReportMetrics({
  patients = [],
  records = [],
  period,
  ageGroup = "all",
} = {}) {
  const group = normalizeNutritionAgeGroup(ageGroup);
  const classification = classifyPatientsInPeriod(patients, records, period, group);
  const eligible = countEligiblePatients(patients, period, group);
  const everEnrolled = countEverEnrolledPatients(patients, records, period, group);
  const coveragePercent = eligible > 0
    ? Math.round((everEnrolled / eligible) * 1000) / 10
    : 0;

  const notes = [
    "Adult BMI categories (WHO) apply only to assessments at age 18 or older.",
    "Children and adolescents are Not Applicable for nutritional status cards — not counted as incomplete.",
    "Enrollment coverage counts unique patients ever enrolled in Nutrition Care on or before the period end.",
  ];
  if (group === "all") {
    notes.unshift("All Ages: status cards and distribution include adult classifications only.");
  }

  return {
    ageGroup: group,
    categories: classification.categories,
    classifiedCount: classification.classifiedCount,
    notApplicableCount: classification.notApplicableCount,
    incompleteAdultCount: classification.incompleteAdultCount,
    everEnrolled,
    eligible,
    coveragePercent,
    notes,
  };
}
