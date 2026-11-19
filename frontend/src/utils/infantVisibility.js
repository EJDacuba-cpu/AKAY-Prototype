import { isInfantPatient, parseCalendarDate } from "./patientUtils.js";

/** Personal & Social keys that an infant consultation must not show or submit. */
export const INFANT_HIDDEN_SOCIAL_KEYS = ["smoking", "alcohol", "diet", "sexual"];

/** BHC Patient Information fields that Background editing never sends. */
export const BHC_PROFILE_SOCIAL_KEYS = ["education", "pastOccupations"];

const EMPTY_VITAL = new Set(["", "—", "-", "–"]);

function asDate(value) {
  if (value === undefined || value === null || value === "") return new Date();
  return parseCalendarDate(value) || new Date();
}

export function patientBirthDate(patient = {}) {
  return (
    patient?.birthdate ||
    patient?.birthDate ||
    patient?.dateOfBirth ||
    patient?.date_of_birth ||
    ""
  );
}

/** Whether the patient is an infant on `asOfDate` (consultation date or today). */
export function isInfantAt(patient, asOfDate) {
  return isInfantPatient(patientBirthDate(patient), asDate(asOfDate));
}

export function infantHiddenSocialKeys(patient, asOfDate, { includeBhcProfileFields = true } = {}) {
  const keys = includeBhcProfileFields ? [...BHC_PROFILE_SOCIAL_KEYS] : [];
  if (isInfantAt(patient, asOfDate)) {
    keys.push(...INFANT_HIDDEN_SOCIAL_KEYS);
    if (!includeBhcProfileFields) keys.push(...BHC_PROFILE_SOCIAL_KEYS);
  }
  return keys;
}

export function omitHiddenSocialKeys(personalSocial, keys = []) {
  if (!personalSocial || typeof personalSocial !== "object") return personalSocial;
  const omitted = { ...personalSocial };
  keys.forEach((key) => {
    delete omitted[key];
  });
  return omitted;
}

export function shouldShowLifestyleControls(patient, asOfDate) {
  return !isInfantAt(patient, asOfDate);
}

export function shouldShowBmiDisplay(patient, asOfDate) {
  return !isInfantAt(patient, asOfDate);
}

function vitalDisplay(readingsByKey, key) {
  const reading = readingsByKey?.[key];
  if (reading == null) return "";
  if (typeof reading === "string" || typeof reading === "number") return String(reading).trim();
  return String(reading.display ?? reading.value ?? "").trim();
}

export function visibleOverviewVitalKeys(keys = [], readingsByKey = {}, { infant = false } = {}) {
  if (!infant) return [...keys];
  return keys.filter((key) => {
    if (key !== "bp" && key !== "spo2") return true;
    const display = vitalDisplay(readingsByKey, key);
    return display !== "" && !EMPTY_VITAL.has(display);
  });
}
