/**
 * Patient Background edits staged in a consultation, per
 * docs/superpowers/specs/2026-10-16-itr-patient-history-design.md.
 *
 * The consultation keeps `backgroundUpdate = { sections, baseRevisions, reviewed }`:
 * `sections` holds only the sections that now differ from the background the
 * workspace loaded, each with the revision it was first edited at in
 * `baseRevisions`; `reviewed` lists the sections the clinician looked at and
 * confirmed ("No changes"). It rides in the draft and is sent with the
 * finalized record, where the server applies it (or answers 409 when an edited
 * section moved since). Pure functions only - no React, no API.
 *
 * Numbers are numbers end to end, and a flag the server stores as "not
 * recorded" comes back missing, so a missing flag always reads as false.
 */

import { packYears } from "./patientHistory.js";
import {
  formatAlcohol,
  formatAllergies,
  formatCycle,
  formatDiet,
  formatEducation,
  formatEnvironment,
  formatFamilyHistory,
  formatHospitalizations,
  formatPatientReported,
  formatPregnancies,
  formatPreviousFpMethod,
  formatSexual,
  formatSmoking,
  formatSymptoms,
} from "./backgroundFormat.js";

export const BACKGROUND_SECTION_KEYS = ["medical", "family", "social", "obstetric"];

export const BACKGROUND_SECTION_LABELS = {
  medical: "Past Medical History",
  family: "Family History",
  social: "Personal & Social History",
  obstetric: "Obstetric & Menstrual History",
};

/** Section => the background keys it owns (mirrors the backend PatientBackground::SECTIONS). */
const SECTION_KEYS = {
  medical: ["currentDiseases", "allergies", "hospitalizations"],
  family: ["familyHistory"],
  social: ["personalSocial"],
  obstetric: ["obstetric"],
};

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A number, or null for blank and non-numeric input. */
function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toFlag(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

// Field types, mirroring the backend FIELDS map. `opt` is text left out of the
// shape while blank (server-owned fields that must not appear on new entries).
const SCHEMA = {
  currentDiseases: [
    { name: "text", yearDiagnosed: "int", diagnosedWhere: "text", note: "text", source: "opt", firstRecorded: "opt" },
  ],
  allergies: { noneKnown: "bool", items: [{ allergen: "text", reaction: "text" }] },
  hospitalizations: {
    none: "bool",
    items: [{ type: "text", year: "int", reason: "text", place: "text" }],
  },
  familyHistory: {
    noneKnown: "bool",
    items: [{ condition: "text", kind: "text", relation: "text", relativePatientId: "int" }],
  },
  personalSocial: {
    education: { level: "text", completed: "text" },
    pastOccupations: "text",
    smoking: { status: "text", sticksPerDay: "int", years: "int", quitYear: "int" },
    alcohol: { status: "text", frequency: "text" },
    diet: { highSalt: "bool", fatty: "bool", sweetDrinks: "bool", lowFruitVeg: "bool", notes: "text" },
    sexual: { active: "text", notes: "text" },
    environment: { waterSource: "text", toilet: "text", exposures: "list", notes: "text" },
  },
  obstetric: {
    menarcheAge: "int",
    menstrualStatus: "text",
    menopauseAge: "int",
    intervalDays: "int",
    durationDays: "int",
    amount: "text",
    regularity: "text",
    symptoms: "list",
    symptomNotes: "text",
    previousFpMethod: "text",
    previousFpMethodOther: "text",
    pregnancies: [{ year: "int", outcome: "text", delivery: "text", place: "text", note: "text" }],
  },
};

/**
 * `value` in the shape of `schema`, with every field present: text "" , numbers
 * null, flags false, lists []. Anything of the wrong type (including the old
 * pre-ITR strings) reads as empty.
 */
function shape(value, schema) {
  if (schema === "text") return text(value);
  if (schema === "int") return toNumber(value);
  if (schema === "bool") return toFlag(value);
  if (schema === "list") {
    return (Array.isArray(value) ? value : []).map(text).filter(Boolean);
  }
  if (Array.isArray(schema)) {
    return (Array.isArray(value) ? value : [])
      .filter(isObject)
      .map((item) => shape(item, schema[0]));
  }

  const source = isObject(value) ? value : {};
  const result = {};
  Object.entries(schema).forEach(([field, type]) => {
    if (type === "opt") {
      const kept = text(source[field]);
      if (kept) result[field] = kept;
    } else {
      result[field] = shape(source[field], type);
    }
  });
  return result;
}

/** One section of a background, in the exact shape the API accepts for it. */
export function sliceBackground(background, section) {
  const bg = isObject(background) ? background : {};
  return Object.fromEntries(
    (SECTION_KEYS[section] || []).map((key) => [key, shape(bg[key], SCHEMA[key])]),
  );
}

/** The patient's whole background with every section, flag and number in its API shape. */
export function normalizeBackground(source) {
  const background = isObject(source) ? source : {};
  const dates = (value) =>
    Object.fromEntries(
      BACKGROUND_SECTION_KEYS.map((section) => [section, text(isObject(value) ? value[section] : "")]),
    );

  return {
    ...Object.assign({}, ...BACKGROUND_SECTION_KEYS.map((section) => sliceBackground(background, section))),
    revisions: Object.fromEntries(
      BACKGROUND_SECTION_KEYS.map((section) => [section, Number(background.revisions?.[section]) || 0]),
    ),
    // When each section was last edited, so the profile can date the record.
    updatedAt: dates(background.updatedAt),
    // When each section was last looked at: { date, facility, by } or null.
    reviewedAt: Object.fromEntries(
      BACKGROUND_SECTION_KEYS.map((section) => {
        const stamp = background.reviewedAt?.[section];
        if (!isObject(stamp) || !text(stamp.date)) return [section, null];
        return [
          section,
          { date: text(stamp.date), facility: text(stamp.facility), by: stamp.by ?? null },
        ];
      }),
    ),
  };
}

/**
 * The environment another household member recorded, offered as a prefill.
 * Null when absent (the admin path sends none); `date` may be null.
 */
export function normalizeHouseholdEnvironment(source) {
  if (!isObject(source) || !isObject(source.environment)) return null;
  return {
    environment: shape(source.environment, SCHEMA.personalSocial.environment),
    patientId: source.patientId ?? null,
    patientName: text(source.patientName),
    date: text(source.date) || null,
  };
}

function isBlank(value) {
  if (value === null || value === undefined || value === false || value === "") return true;
  if (Array.isArray(value)) return value.every(isBlank);
  if (isObject(value)) return Object.values(value).every(isBlank);
  return false;
}

/** The slice with list entries the clinician has left completely blank removed. */
function withoutBlankItems(slice) {
  const prune = (value) => {
    if (Array.isArray(value)) return value.filter((item) => !isBlank(item)).map(prune);
    if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, prune(v)]));
    return value;
  };
  return prune(slice);
}

/** Comparable form: blank rows and the server-owned source/firstRecorded left out. */
function canonical(slice) {
  return JSON.stringify(withoutBlankItems(slice), (key, value) =>
    key === "source" || key === "firstRecorded" ? undefined : value,
  );
}

export function sectionChanged(before, after, section) {
  return canonical(sliceBackground(before, section)) !== canonical(sliceBackground(after, section));
}

/**
 * Every field a section owns, in display order. `read(slice)` is its display
 * text and works on a whole background or a section slice alike.
 */
export const BACKGROUND_SECTION_FIELDS = {
  medical: [
    {
      key: "currentDiseases",
      label: "Patient-reported Conditions",
      read: (slice) => formatPatientReported(slice?.currentDiseases),
    },
    { key: "allergies", label: "Allergies", read: (slice) => formatAllergies(slice?.allergies) },
    {
      key: "hospitalizations",
      label: "Hospitalizations & Surgeries",
      read: (slice) => formatHospitalizations(slice?.hospitalizations),
    },
  ],
  family: [
    {
      key: "familyHistory",
      label: "Family Conditions",
      read: (slice) => formatFamilyHistory(slice?.familyHistory),
    },
  ],
  social: [
    {
      key: "education",
      label: "Education",
      read: (slice) => formatEducation(slice?.personalSocial?.education),
    },
    {
      key: "pastOccupations",
      label: "Past Occupations",
      read: (slice) => text(slice?.personalSocial?.pastOccupations),
    },
    {
      key: "smoking",
      label: "Smoking",
      read: (slice) => {
        const smoking = slice?.personalSocial?.smoking;
        return formatSmoking(smoking, packYears(smoking || {}));
      },
    },
    {
      key: "alcohol",
      label: "Alcohol",
      read: (slice) => formatAlcohol(slice?.personalSocial?.alcohol),
    },
    { key: "diet", label: "Diet", read: (slice) => formatDiet(slice?.personalSocial?.diet) },
    {
      key: "sexual",
      label: "Sexual History",
      read: (slice) => formatSexual(slice?.personalSocial?.sexual),
    },
    {
      key: "environment",
      label: "Household Environment",
      read: (slice) => formatEnvironment(slice?.personalSocial?.environment),
    },
  ],
  obstetric: [
    { key: "cycle", label: "Usual menstrual cycle", read: (slice) => formatCycle(slice?.obstetric) },
    { key: "symptoms", label: "Menstrual Symptoms", read: (slice) => formatSymptoms(slice?.obstetric) },
    { key: "previousFp", label: "Previous FP method", read: (slice) => formatPreviousFpMethod(slice?.obstetric) },
    {
      key: "pregnancies",
      label: "Previous pregnancies",
      read: (slice) => formatPregnancies(slice?.obstetric?.pregnancies),
    },
  ],
};

export const PATIENT_REPORTED_SOURCE = "Patient-reported";

/**
 * A Previous Condition the patient reports: a name and optional detail, no
 * status (only RHU sets one). The server stamps the rest. Null for a blank name.
 */
export function newPatientReportedCondition(name, note = "", detail = {}) {
  const trimmed = text(name);
  if (!trimmed) return null;
  return {
    name: trimmed,
    yearDiagnosed: toNumber(detail?.yearDiagnosed),
    diagnosedWhere: text(detail?.diagnosedWhere),
    note: text(note),
    source: PATIENT_REPORTED_SOURCE,
  };
}

function validReviewed(list) {
  const given = Array.isArray(list) ? list : [];
  return BACKGROUND_SECTION_KEYS.filter((section) => given.includes(section));
}

/**
 * The staged update for an edited background, or null when nothing differs
 * from what was loaded and nothing is reviewed. A section keeps the base
 * revision it was first edited at (from `previous`), so a background refetched
 * mid-consultation cannot quietly move the base past someone else's change.
 * `previous.reviewed` is kept.
 */
export function buildBackgroundUpdate(loaded, edited, previous = null) {
  const sections = {};
  const baseRevisions = {};

  BACKGROUND_SECTION_KEYS.forEach((section) => {
    if (!sectionChanged(loaded, edited, section)) return;
    sections[section] = sliceBackground(edited, section);
    const previousBase = previous?.baseRevisions?.[section];
    baseRevisions[section] = Number.isInteger(previousBase)
      ? previousBase
      : Number(loaded?.revisions?.[section]) || 0;
  });

  const reviewed = validReviewed(previous?.reviewed);
  return Object.keys(sections).length || reviewed.length
    ? { sections, baseRevisions, reviewed }
    : null;
}

/** The background with a staged update laid over it - what the editor shows on resume. */
export function overlayBackgroundUpdate(background, update) {
  const result = { ...(background || {}) };
  Object.values(update?.sections || {}).forEach((slice) => Object.assign(result, slice));
  return result;
}

export function editedSectionKeys(update) {
  return BACKGROUND_SECTION_KEYS.filter((section) => update?.sections?.[section]);
}

export function reviewedSectionKeys(update) {
  return validReviewed(update?.reviewed);
}

/** The update with these sections also marked reviewed ("No changes"). */
export function markReviewed(update, sectionKeys) {
  return {
    sections: { ...(update?.sections || {}) },
    baseRevisions: { ...(update?.baseRevisions || {}) },
    reviewed: validReviewed([...reviewedSectionKeys(update), ...(sectionKeys || [])]),
  };
}

/** The update without this section marked reviewed; null when nothing is left. */
export function unmarkReviewed(update, sectionKey) {
  const reviewed = reviewedSectionKeys(update).filter((section) => section !== sectionKey);
  const sections = { ...(update?.sections || {}) };
  if (!Object.keys(sections).length && !reviewed.length) return null;
  return { sections, baseRevisions: { ...(update?.baseRevisions || {}) }, reviewed };
}

/** The fields of one section that differ between two backgrounds (or slices), as display text. */
export function backgroundChangeRows(before, after, section) {
  return BACKGROUND_SECTION_FIELDS[section]
    .map((field) => ({
      key: field.key,
      label: field.label,
      before: text(field.read(before)),
      after: text(field.read(after)),
    }))
    .filter((row) => row.before !== row.after);
}

/**
 * The record API's spelling of a staged update, or undefined when nothing is
 * edited and nothing is reviewed. A reviewed-only update sends `reviewed`
 * alone: `sections` and `base_revisions` are left out when no section is edited.
 */
export function toRecordBackgroundUpdate(update) {
  const edited = editedSectionKeys(update);
  const reviewed = reviewedSectionKeys(update);
  if (!edited.length && !reviewed.length) return undefined;

  const payload = { reviewed };
  if (edited.length) {
    payload.sections = Object.fromEntries(
      edited.map((section) => [section, withoutBlankItems(update.sections[section])]),
    );
    payload.base_revisions = Object.fromEntries(
      edited.map((section) => [section, Number(update.baseRevisions?.[section]) || 0]),
    );
  }
  return payload;
}

/**
 * The staged update as the draft stores it (camelCase, like the update itself),
 * with completely blank rows pruned the same way the record payload prunes
 * them; null when nothing is edited or reviewed. Half-filled rows are kept -
 * the server only demands the required fields on finalize.
 */
export function toDraftBackgroundUpdate(update) {
  const edited = editedSectionKeys(update);
  const reviewed = reviewedSectionKeys(update);
  if (!edited.length && !reviewed.length) return null;

  return {
    sections: Object.fromEntries(edited.map((section) => [section, withoutBlankItems(update.sections[section])])),
    baseRevisions: Object.fromEntries(
      edited.map((section) => [section, Number(update.baseRevisions?.[section]) || 0]),
    ),
    reviewed,
  };
}

/** Whether `value` only uses the keys and nesting of `schema` (leaf types are not checked). */
function fitsSchema(value, schema) {
  if (value === null || value === undefined) return true;
  if (schema === "list") return Array.isArray(value);
  if (typeof schema === "string") return typeof value !== "object";
  if (Array.isArray(schema)) return Array.isArray(value) && value.every((item) => fitsSchema(item, schema[0]));
  if (!isObject(value)) return false;
  return Object.entries(value).every(
    ([key, item]) => Object.prototype.hasOwnProperty.call(schema, key) && fitsSchema(item, schema[key]),
  );
}

/**
 * True for an update in a pre-ITR shape (mirrors the backend
 * PatientBackground::isLegacyUpdate): any key outside today's sections and
 * fields - surgeries, similarIllness, personalSocial.notes, a condition's
 * status / conditionKey / lastConfirmed - or a value of the wrong kind, such as
 * the old string fields where an object now belongs.
 */
function isLegacyUpdate(raw) {
  const sections = isObject(raw.sections) ? raw.sections : {};
  return Object.entries(sections).some(([section, slice]) => {
    const keys = SECTION_KEYS[section];
    if (!keys || !isObject(slice)) return false;
    return Object.entries(slice).some(([key, value]) => !keys.includes(key) || !fitsSchema(value, SCHEMA[key]));
  });
}

/**
 * A staged update read back from a saved draft, or null when there is none or
 * it is in an old shape (it is dropped, not migrated). Sections are re-shaped
 * because the server drops "not recorded" flags and empty fields from drafts.
 */
export function restoreBackgroundUpdate(raw) {
  if (!isObject(raw) || isLegacyUpdate(raw)) return null;

  const given = isObject(raw.sections) ? raw.sections : {};
  const sections = {};
  const baseRevisions = {};
  BACKGROUND_SECTION_KEYS.forEach((section) => {
    if (!isObject(given[section])) return;
    sections[section] = sliceBackground(given[section], section);
    const base = toNumber(raw.baseRevisions?.[section] ?? raw.base_revisions?.[section]);
    baseRevisions[section] = Number.isInteger(base) && base >= 0 ? base : 0;
  });

  const reviewed = validReviewed(raw.reviewed);
  return Object.keys(sections).length || reviewed.length ? { sections, baseRevisions, reviewed } : null;
}

/** The per-section conflicts of a 409 from the record save, or null for any other error. */
export function readBackgroundConflicts(error) {
  if (error?.status !== 409 || error?.payload?.code !== "PATIENT_BACKGROUND_CONFLICT") return null;
  return Array.isArray(error.payload.conflicts) ? error.payload.conflicts : [];
}

/**
 * Applies the clinician's choice per conflicting section: "mine" keeps their
 * edit and rebases it onto the latest revision, "latest" drops their edit.
 * Sections marked reviewed stay reviewed. Returns null when no edited section
 * and no reviewed section is left.
 */
export function resolveBackgroundConflicts(update, conflicts, choices) {
  const sections = { ...(update?.sections || {}) };
  const baseRevisions = { ...(update?.baseRevisions || {}) };

  (conflicts || []).forEach(({ section, revision }) => {
    if (choices?.[section] === "mine") {
      baseRevisions[section] = Number(revision) || 0;
    } else if (choices?.[section] === "latest") {
      delete sections[section];
      delete baseRevisions[section];
    }
  });

  const reviewed = reviewedSectionKeys(update);
  return Object.keys(sections).length || reviewed.length ? { sections, baseRevisions, reviewed } : null;
}

/** Only sections the clinician edited can conflict; every one needs a choice before retrying. */
export function allConflictsResolved(conflicts, choices) {
  return (conflicts || []).every(({ section }) => ["mine", "latest"].includes(choices?.[section]));
}
