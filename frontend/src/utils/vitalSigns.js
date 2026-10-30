/**
 * Optional vital-sign encoding checks shared by the BHC Physical Examination
 * step and official health-record saves.
 *
 * Blank stays valid. These are unit ceilings, not adult reference ranges:
 * unusual-but-plausible values pass, and nothing is diagnosed from them.
 */
import { validateFbs } from "./fbs.js";

export const BP_PAIR_MESSAGE = "Enter both systolic and diastolic blood pressure.";
export const BP_RANGE_MESSAGE = "Enter a blood pressure between 0 and 300 mmHg.";
export const PULSE_MESSAGE = "Enter a pulse rate between 0 and 350 bpm.";
export const SPO2_MESSAGE = "Enter an SpO₂ between 0 and 100%.";
export const TEMP_MESSAGE = "Enter a temperature between 10 and 50°C.";
export const WEIGHT_MESSAGE = "Enter a weight greater than 0 and at most 500 kg.";
export const HEIGHT_MESSAGE = "Enter a height greater than 0 and at most 250 cm.";
export const EMPTY_VITALS_REMINDER = "No vital signs were recorded for this visit.";

export const VITAL_ERROR_KEYS = [
  "systolicBp",
  "diastolicBp",
  "bloodPressure",
  "pulse",
  "spo2",
  "temp",
  "weight",
  "height",
  "fbs",
  "vital_signs.fbs",
];

const VITAL_FIELDS = [
  "systolicBp",
  "diastolicBp",
  "pulse",
  "spo2",
  "temp",
  "weight",
  "height",
  "fbs",
];

export function isVitalFilled(value) {
  return String(value ?? "").trim() !== "";
}

function parseNumber(value) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : Number.NaN;
}

function rangeError(value, { min, max, exclusiveMin = false, message }) {
  if (!isVitalFilled(value)) return "";
  const number = parseNumber(value);
  if (!Number.isFinite(number)) return message;
  if (exclusiveMin ? !(number > min) : number < min) return message;
  if (number > max) return message;
  return "";
}

function bloodPressureError(value) {
  return rangeError(value, { min: 0, max: 300, message: BP_RANGE_MESSAGE });
}

/** True when every optional vital (including FBS) is blank. */
export function areVitalSignsBlank(vitals = {}) {
  return !VITAL_FIELDS.some((field) => isVitalFilled(vitals[field]));
}

export function relatedVitalErrorKeys(field) {
  if (field === "systolicBp" || field === "diastolicBp" || field === "bloodPressure") {
    return ["systolicBp", "diastolicBp", "bloodPressure"];
  }
  if (field === "fbs" || field === "vital_signs.fbs") return ["fbs", "vital_signs.fbs"];
  return [field];
}

/**
 * Merge one field's encoding errors: clear when valid; show a new error only
 * on blur (`reveal`) or when that field already has a message.
 */
export function mergeVitalFieldErrors(current, nextErrors, field, { reveal = false } = {}) {
  const next = { ...current };
  for (const key of relatedVitalErrorKeys(field)) {
    if (nextErrors[key]) {
      if (reveal || next[key]) next[key] = nextErrors[key];
    } else {
      delete next[key];
    }
  }
  return next;
}

/**
 * Blocking errors for filled-but-invalid measurements. Empty when every
 * field is blank or within its encoding bounds.
 *
 * @returns {Record<string, string>}
 */
export function vitalSignsErrors({
  systolicBp = "",
  diastolicBp = "",
  pulse = "",
  spo2 = "",
  temp = "",
  weight = "",
  height = "",
  fbs = "",
} = {}) {
  const errors = {};
  const sysFilled = isVitalFilled(systolicBp);
  const diaFilled = isVitalFilled(diastolicBp);

  if (sysFilled !== diaFilled) {
    errors.bloodPressure = BP_PAIR_MESSAGE;
  }

  const systolicError = bloodPressureError(systolicBp);
  if (systolicError) errors.systolicBp = systolicError;
  const diastolicError = bloodPressureError(diastolicBp);
  if (diastolicError) errors.diastolicBp = diastolicError;

  const pulseError = rangeError(pulse, { min: 0, max: 350, message: PULSE_MESSAGE });
  if (pulseError) errors.pulse = pulseError;
  const spo2Error = rangeError(spo2, { min: 0, max: 100, message: SPO2_MESSAGE });
  if (spo2Error) errors.spo2 = spo2Error;
  const tempError = rangeError(temp, { min: 10, max: 50, message: TEMP_MESSAGE });
  if (tempError) errors.temp = tempError;
  const weightError = rangeError(weight, {
    min: 0,
    max: 500,
    exclusiveMin: true,
    message: WEIGHT_MESSAGE,
  });
  if (weightError) errors.weight = weightError;
  const heightError = rangeError(height, {
    min: 0,
    max: 250,
    exclusiveMin: true,
    message: HEIGHT_MESSAGE,
  });
  if (heightError) errors.height = heightError;

  const fbsError = validateFbs(fbs);
  if (fbsError) errors.fbs = fbsError;

  return errors;
}
