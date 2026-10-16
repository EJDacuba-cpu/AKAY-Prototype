/**
 * Display text for the structured background sections (ITR page 1). Pure
 * functions: stored values in, one readable line out. Every formatter returns
 * "" when nothing is recorded, and also for null, old string-shaped values and
 * anything else it does not recognise - it never throws.
 *
 * The server drops `false` booleans, so a missing flag always means false.
 * Wording for stored camelCase values lives in patientHistory.js; this file
 * looks the labels up there.
 */

import {
  DELIVERY_TYPES,
  EXPOSURES,
  MENSTRUAL_SYMPTOMS,
  PREGNANCY_OUTCOMES,
  summarizeAllergies,
} from "./patientHistory.js";

const SEPARATOR = " · ";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function whole(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function labelFor(options, value) {
  return options.find((option) => option.value === value)?.label || "";
}

function items(value) {
  return Array.isArray(value?.items) ? value.items.filter(isObject) : [];
}

function join(parts, separator = SEPARATOR) {
  return parts.filter(Boolean).join(separator);
}

export function formatAllergies(allergies) {
  if (!isObject(allergies)) return "";
  return summarizeAllergies(allergies).text;
}

export function formatHospitalizations(value) {
  if (!isObject(value)) return "";
  const entries = items(value)
    .map((item) => {
      const head = join([text(item.type), whole(item.year) ?? text(item.year)], " ");
      const detail = join([text(item.reason), text(item.place)], ", ");
      if (head && detail) return `${head}: ${detail}`;
      return head || detail;
    })
    .filter(Boolean);
  if (entries.length) return entries.join("; ");
  return value.none === true ? "None" : "";
}

export function formatFamilyHistory(value) {
  if (!isObject(value)) return "";
  const entries = items(value)
    .map((item) => {
      const condition = text(item.condition);
      if (!condition) return "";
      const detail = join([text(item.kind), text(item.relation)], ", ");
      return detail ? `${condition} (${detail})` : condition;
    })
    .filter(Boolean);
  if (entries.length) return entries.join("; ");
  return value.noneKnown === true ? "None known" : "";
}

export function formatEducation(value) {
  if (!isObject(value)) return "";
  const level = text(value.level);
  if (!level) return "";
  const completed = text(value.completed);
  return completed ? `${level} (${completed})` : level;
}

const SMOKING_STATUS = {
  never: "Never smoked",
  former: "Former smoker",
  current: "Current smoker",
};

/** `packYearsValue` comes from the caller (packYears in patientHistory.js). Never classified. */
export function formatSmoking(value, packYearsValue) {
  if (!isObject(value)) return "";
  const status = SMOKING_STATUS[value.status];
  if (!status) return "";
  if (value.status === "never") return status;

  const sticks = whole(value.sticksPerDay);
  const years = whole(value.years);
  const quitYear = whole(value.quitYear);
  const pack = whole(packYearsValue);
  return join([
    status,
    sticks !== null ? `${sticks} sticks/day` : "",
    years !== null ? plural(years, "yr") : "",
    value.status === "former" && quitYear !== null ? `quit ${quitYear}` : "",
    pack !== null ? `${pack} pack-yrs` : "",
  ]);
}

const ALCOHOL_STATUS = {
  never: "Does not drink",
  former: "Former drinker",
  current: "Current drinker",
};

export function formatAlcohol(value) {
  if (!isObject(value)) return "";
  const status = ALCOHOL_STATUS[value.status];
  if (!status) return "";
  const frequency = value.status === "current" ? text(value.frequency) : "";
  return join([status, frequency]);
}

const DIET_FLAGS = [
  ["highSalt", "High salt"],
  ["fatty", "Fatty foods"],
  ["sweetDrinks", "Sweet drinks"],
  ["lowFruitVeg", "Low fruit and vegetables"],
];

export function formatDiet(value) {
  if (!isObject(value)) return "";
  const flags = DIET_FLAGS.filter(([key]) => value[key] === true).map(([, label], index) =>
    index === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1),
  );
  return join([flags.join(", "), text(value.notes)]);
}

const SEXUAL_ACTIVITY = {
  yes: "Sexually active",
  no: "Not sexually active",
  declined: "Declined to answer",
};

export function formatSexual(value) {
  if (!isObject(value)) return "";
  return join([SEXUAL_ACTIVITY[value.active], text(value.notes)]);
}

export function formatEnvironment(value) {
  if (!isObject(value)) return "";
  const water = text(value.waterSource);
  const toilet = text(value.toilet);
  const exposures = (Array.isArray(value.exposures) ? value.exposures : [])
    .map((exposure) => labelFor(EXPOSURES, exposure))
    .filter(Boolean);
  return join([
    water ? `Water: ${water}` : "",
    toilet ? `Toilet: ${toilet}` : "",
    exposures.join(", "),
    text(value.notes),
  ]);
}

/** Menarche, status and flow pattern. Symptoms and pregnancies have their own formatters. */
export function formatCycle(obstetric) {
  if (!isObject(obstetric)) return "";
  const menarche = whole(obstetric.menarcheAge);
  const interval = whole(obstetric.intervalDays);
  const duration = whole(obstetric.durationDays);
  const menopauseAge = whole(obstetric.menopauseAge);

  let status = "";
  if (obstetric.menstrualStatus === "menstruating") status = "Menstruating";
  if (obstetric.menstrualStatus === "menopause") {
    status = menopauseAge !== null ? `Menopause at ${menopauseAge}` : "Menopause";
  }

  const amount = text(obstetric.amount);
  return join([
    menarche !== null ? `Menarche at ${menarche}` : "",
    status,
    interval !== null ? `every ${plural(interval, "day")}` : "",
    duration !== null ? `lasts ${plural(duration, "day")}` : "",
    amount ? `${amount} flow` : "",
    text(obstetric.regularity),
  ]);
}

export function formatSymptoms(obstetric) {
  if (!isObject(obstetric)) return "";
  const symptoms = (Array.isArray(obstetric.symptoms) ? obstetric.symptoms : [])
    .map((symptom) => labelFor(MENSTRUAL_SYMPTOMS, symptom))
    .filter(Boolean);
  return join([symptoms.join(", "), text(obstetric.symptomNotes)]);
}

/** Previous pregnancies are history entries, not a verified current-pregnancy OB score. */
export function formatPregnancies(list) {
  if (!Array.isArray(list) || list.length === 0) return "";
  const entries = list.map((pregnancy) => {
    if (!isObject(pregnancy)) return "outcome not recorded";
    const year = whole(pregnancy.year);
    const outcome = labelFor(PREGNANCY_OUTCOMES, pregnancy.outcome).toLowerCase();
    const delivery =
      pregnancy.delivery === "notApplicable" ? "" : labelFor(DELIVERY_TYPES, pregnancy.delivery).toLowerCase();
    const detail = join([delivery, text(pregnancy.place)], ", ");
    const main = join([year !== null ? String(year) : "", outcome || "outcome not recorded"], " ");
    return join([detail ? `${main} (${detail})` : main, text(pregnancy.note)]);
  });
  return entries.join("; ");
}

/** Conditions the patient reported that RHU has not confirmed. */
export function formatPatientReported(diseases) {
  if (!Array.isArray(diseases)) return "";
  return diseases
    .filter(isObject)
    .map((disease) => {
      const name = text(disease.name);
      if (!name) return "";
      const year = whole(disease.yearDiagnosed) ?? text(disease.yearDiagnosed);
      const context = join([year ? String(year) : "", text(disease.diagnosedWhere)], ", ");
      const base = context ? `${name} (${context})` : name;
      const note = text(disease.note);
      return note ? `${base} - ${note}` : base;
    })
    .filter(Boolean)
    .join("; ");
}
