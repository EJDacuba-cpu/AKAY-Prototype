// Extensions are explicit so this module can be exercised directly by
// `node --test`, which does not resolve extensionless specifiers.
import { calculateAge, getPatientSex } from "./patientUtils.js";
import { getSpecializedRecordPrograms } from "./healthRecordPrograms.js";

/**
 * Which program areas a patient's chart should expose, and why.
 *
 * Two independent questions decide a program tab, and conflating them is the
 * bug this module exists to prevent:
 *
 *   applicable  - may a NEW record of this program be started for this patient
 *                 today? This is a clinical eligibility window (sex and age),
 *                 and it closes as the patient ages out.
 *   hasHistory  - does the patient already have records of this program? Once
 *                 true it is true forever.
 *
 * A tab is shown when `applicable || hasHistory`. History alone must keep the
 * tab visible, so a woman who is past her last pregnancy, or a teenager who
 * aged out of the child immunization schedule, never loses the chart that
 * documents their care.
 *
 * Deliberately NOT "female => Women's Health" or "child => EPI": a bare sex or
 * age test would both over-show (every female patient regardless of care) and
 * under-show (hiding a real history the moment the window closes).
 */

/** Child immunization schedule boundary, matching Add Health Record's own gate. */
const ADULT_IMMUNIZATION_MIN_AGE_YEARS = 18;

/** Youngest age at which reproductive-health services are offered. */
const WOMENS_HEALTH_MIN_AGE_YEARS = 10;

/**
 * Age in whole years, or null when it cannot be established.
 *
 * Null is meaningful here: an unknown age cannot satisfy an eligibility
 * window, so applicability falls back to "no" and the tab then depends purely
 * on history. Treating unknown as eligible is what would turn these rules back
 * into "every female patient gets the tab".
 */
export function getPatientAgeInYears(patient = {}) {
  const birthdate =
    patient?.birthdate ||
    patient?.birthDate ||
    patient?.dateOfBirth ||
    patient?.date_of_birth ||
    "";

  const fromBirthdate = calculateAge(birthdate);
  if (fromBirthdate !== "" && Number.isFinite(Number(fromBirthdate))) {
    return Number(fromBirthdate);
  }

  if (Number.isFinite(Number(patient?.age)) && String(patient?.age).trim()) {
    return Number(patient.age);
  }

  const ageMatch = String(patient?.ageSex || "").match(/\d+(?:\.\d+)?/);
  return ageMatch ? Number(ageMatch[0]) : null;
}

export function isPatientMale(patient = {}) {
  return getPatientSex(patient).toLowerCase().startsWith("m");
}

/**
 * Women's health services (prenatal, maternal, family planning) may be started.
 *
 * No upper age bound: family planning and other women's health care continue
 * past reproductive age. The narrower prenatal-only rule stays in the record
 * form, where a specific program is being chosen.
 */
export function isWomensHealthApplicable(patient = {}) {
  if (isPatientMale(patient)) return false;

  const age = getPatientAgeInYears(patient);
  return age !== null && age >= WOMENS_HEALTH_MIN_AGE_YEARS;
}

/** The child immunization schedule may still be started for this patient. */
export function isPediatricApplicable(patient = {}) {
  const age = getPatientAgeInYears(patient);
  return age !== null && age < ADULT_IMMUNIZATION_MIN_AGE_YEARS;
}

/** The program keys whose records belong to each conditional chart area. */
export const WOMENS_HEALTH_PROGRAMS = Object.freeze([
  "maternal",
  "familyPlanning",
]);
export const PEDIATRIC_PROGRAMS = Object.freeze(["epi"]);

function countProgramRecords(records, programKeys) {
  const matching = getSpecializedRecordPrograms(records).filter(program => programKeys.includes(program.key));
  return new Set(matching.flatMap(program => program.records)).size;
}

/**
 * Resolves the conditional chart areas for one patient.
 *
 * Returns an entry per area with the counts and the reason it is visible, so
 * the UI can explain a history-only tab ("shown because past records exist")
 * rather than silently rendering an area the patient is no longer eligible for.
 */
export function getConditionalProgramTabs(patient = {}, records = []) {
  return [
    {
      key: "womensHealth",
      label: "Women's Health",
      programs: WOMENS_HEALTH_PROGRAMS,
      applicable: isWomensHealthApplicable(patient),
      recordCount: countProgramRecords(records, WOMENS_HEALTH_PROGRAMS),
    },
    {
      key: "pediatric",
      label: "Pediatric / EPI",
      programs: PEDIATRIC_PROGRAMS,
      applicable: isPediatricApplicable(patient),
      recordCount: countProgramRecords(records, PEDIATRIC_PROGRAMS),
    },
  ]
    .map((area) => ({
      ...area,
      hasHistory: area.recordCount > 0,
      visible: area.applicable || area.recordCount > 0,
      // History outlives eligibility: this is what the UI labels so a closed
      // eligibility window reads as "kept for the record", not as an error.
      historyOnly: !area.applicable && area.recordCount > 0,
    }))
    .filter((area) => area.visible);
}
