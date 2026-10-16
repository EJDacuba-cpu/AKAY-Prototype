/**
 * Patient History logic (ITR page 1): option lists, derived values and
 * per-section status. Pure functions only - no React, no API. Nothing computed
 * here is stored; age and pack-years are worked out when displayed.
 *
 * Booleans the server stores as "not recorded" come back missing, so a missing
 * flag always means false.
 */

import { calculateAgeInYears } from "./maternalRisk.js";

// Option lists. Plain strings are both the stored value and the label;
// { value, label } entries are stored by `value` and shown by `label`.
export const INFORMANT_RELATIONS = [
  "Patient",
  "Mother",
  "Father",
  "Spouse",
  "Guardian",
  "Grandparent",
  "Sibling",
  "Other",
];

export const FAMILY_RELATIONS = [
  "Mother",
  "Father",
  "Sibling",
  "Grandparent",
  "Child",
  "Other",
];

export const EDUCATION_LEVELS = [
  "None",
  "Elementary",
  "High School",
  "Senior High School",
  "Vocational",
  "College",
  "Postgraduate",
];

export const WATER_SOURCES = ["Level I", "Level II", "Level III", "Other"];

export const TOILET_TYPES = [
  "Water-sealed (own)",
  "Water-sealed (shared)",
  "Pit latrine",
  "None",
  "Other",
];

export const EXPOSURES = [
  { value: "secondhandSmoke", label: "Secondhand smoke" },
  { value: "biomassCooking", label: "Biomass cooking" },
  { value: "industrialPollution", label: "Industrial pollution" },
];

export const MENSTRUAL_SYMPTOMS = [
  { value: "dysmenorrhea", label: "Dysmenorrhea" },
  { value: "headache", label: "Headache" },
  { value: "moodChanges", label: "Mood changes" },
  { value: "bloating", label: "Bloating" },
  { value: "breastTenderness", label: "Breast tenderness" },
];

export const PREGNANCY_OUTCOMES = [
  { value: "liveBirth", label: "Live birth" },
  { value: "miscarriage", label: "Miscarriage" },
  { value: "stillbirth", label: "Stillbirth" },
];

export const DELIVERY_TYPES = [
  { value: "normal", label: "Normal" },
  { value: "cesarean", label: "Cesarean" },
  { value: "notApplicable", label: "Not applicable" },
];

/** The sections staff can update (II-V). General Data (I) is read-only identity. */
export const EDITABLE_SECTION_KEYS = ["medical", "family", "social", "obstetric"];

// Background fields each section owns. `surgeries` is the old string field,
// kept so legacy data never looks empty.
const SECTION_FIELDS = {
  medical: ["currentDiseases", "allergies", "hospitalizations", "surgeries"],
  family: ["familyHistory"],
  social: ["personalSocial"],
  obstetric: ["obstetric"],
};

const ADULT_AGE = 18;
const OBSTETRIC_OPEN_AGE = 10;
const SEXUAL_OPEN_AGE = 15;

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** True when a value (any depth, any shape - including old strings) holds something recorded. */
function anyFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.some(anyFilled);
  if (typeof value === "object") return Object.values(value).some(anyFilled);
  return false;
}

/** Pack-years = sticks per day / 20 x years, one decimal; null until both are given. */
export function packYears({ sticksPerDay, years } = {}) {
  const sticks = toNumber(sticksPerDay);
  const span = toNumber(years);
  if (sticks === null || span === null || sticks <= 0 || span < 0) return null;
  return Math.round((sticks / 20) * span * 10) / 10;
}

/**
 * Per-visit informant default. `patient` is the parameter object
 * { birthdate, motherPatientId, motherName, guardianName } (optional extras:
 * `name`, `id` for the Patient default). Staff can always change it.
 */
export function defaultInformant(patient, today) {
  const age = calculateAgeInYears(patient?.birthdate, today);
  if (age === null) return null;
  if (age >= ADULT_AGE) {
    return {
      relation: "Patient",
      name: patient.name || "",
      patientId: patient.id ? String(patient.id) : null,
    };
  }
  if (patient.motherPatientId) {
    return {
      relation: "Mother",
      name: patient.motherName || "",
      patientId: String(patient.motherPatientId),
    };
  }
  if (hasText(patient.guardianName)) {
    return { relation: "Guardian", name: patient.guardianName.trim(), patientId: null };
  }
  return null;
}

/** Which optional subsections start open. Unknown age counts as open. */
export function sectionVisibility(patient, today) {
  const age = calculateAgeInYears(patient?.birthdate, today);
  const isFemale = String(patient?.sex || "").trim().toLowerCase() === "female";
  const openAt = (threshold) => (age === null || age >= threshold ? "open" : "collapsed");
  return {
    obstetric: isFemale ? openAt(OBSTETRIC_OPEN_AGE) : "hidden",
    sexual: openAt(SEXUAL_OPEN_AGE),
  };
}

/** Whether a section holds anything recorded. Never throws; old string shapes count. */
export function hasRecordedData(background, section) {
  const fields = SECTION_FIELDS[section];
  if (!fields || !background || typeof background !== "object") return false;
  return fields.some((field) => anyFilled(background[field]));
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * How a section reads in the section list. General Data is rendered by the
 * caller. "lastReviewed" needs a dated review stamp; a section that only has
 * an edit date or data is "recorded" (not yet reviewed), dated when it can be.
 */
export function sectionStatus({ background, update, section, today } = {}) {
  if (hasOwn(update?.sections, section)) return { kind: "updatedToday", date: today };
  if (Array.isArray(update?.reviewed) && update.reviewed.includes(section)) {
    return { kind: "reviewedToday", date: today };
  }

  const reviewed = background?.reviewedAt?.[section];
  if (reviewed?.date) {
    return { kind: "lastReviewed", date: reviewed.date, facility: reviewed.facility || undefined };
  }
  const updatedAt = background?.updatedAt?.[section] || undefined;
  if (updatedAt || hasRecordedData(background, section)) {
    return { kind: "recorded", date: updatedAt };
  }
  return { kind: "notRecorded" };
}

/** Allergy line for the section header and alert chips. */
export function summarizeAllergies(allergies) {
  if (allergies === null || allergies === undefined) {
    return { status: "unrecorded", text: "" };
  }
  if (typeof allergies === "string") {
    return hasText(allergies)
      ? { status: "recorded", text: allergies.trim() }
      : { status: "unrecorded", text: "" };
  }
  if (typeof allergies !== "object") return { status: "unrecorded", text: "" };

  const items = Array.isArray(allergies.items) ? allergies.items : [];
  const labels = items
    .map((item) => {
      const allergen = hasText(item?.allergen) ? item.allergen.trim() : "";
      const reaction = hasText(item?.reaction) ? item.reaction.trim() : "";
      if (!allergen) return "";
      return reaction ? `${allergen} (${reaction})` : allergen;
    })
    .filter(Boolean);
  if (labels.length) return { status: "recorded", text: labels.join(", ") };
  if (allergies.noneKnown === true) return { status: "none", text: "No known allergies" };
  return { status: "unrecorded", text: "" };
}

/**
 * Review-step grouping. `sections` is the visible editable keys (a hidden
 * obstetric section is left out by the caller). Informational only.
 */
export function reviewGroups({ update, sections = EDITABLE_SECTION_KEYS } = {}) {
  const updatedKeys = update?.sections || {};
  const reviewedKeys = Array.isArray(update?.reviewed) ? update.reviewed : [];
  const groups = { updated: [], reviewed: [], notReviewed: [] };
  sections.forEach((section) => {
    if (hasOwn(updatedKeys, section)) groups.updated.push(section);
    else if (reviewedKeys.includes(section)) groups.reviewed.push(section);
    else groups.notReviewed.push(section);
  });
  return groups;
}
