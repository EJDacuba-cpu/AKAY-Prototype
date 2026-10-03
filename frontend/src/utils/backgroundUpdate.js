/**
 * Patient Background edits staged in a consultation, per
 * docs/superpowers/specs/2026-10-03-patient-background-tab-design.md.
 *
 * The consultation keeps `backgroundUpdate = { sections, baseRevisions }`:
 * only the sections that now differ from the background the workspace loaded,
 * each with the revision it was first edited at. It rides in the draft and is
 * sent with the finalized record, where the server applies it (or answers 409
 * when an edited section moved since). Pure functions only - no React, no API.
 */

export const BACKGROUND_SECTION_KEYS = ["medical", "family", "social"];

export const BACKGROUND_SECTION_LABELS = {
  medical: "Past Medical History",
  family: "Family History",
  social: "Personal & Social History",
};

/** Every field a section owns, in display order. `group` is the nested object it lives in. */
export const BACKGROUND_SECTION_FIELDS = {
  medical: [
    { key: "currentDiseases", label: "Current Conditions" },
    { key: "allergies", label: "Allergies" },
    { key: "hospitalizations", label: "Hospitalizations" },
    { key: "surgeries", label: "Surgeries" },
  ],
  family: [
    { group: "familyHistory", key: "similarIllness", label: "Similar Illness" },
    { group: "familyHistory", key: "chronicIllness", label: "Chronic Illness" },
    { group: "familyHistory", key: "hereditaryIllness", label: "Hereditary Illness" },
  ],
  social: [
    { group: "personalSocial", key: "diet", label: "Diet" },
    { group: "personalSocial", key: "smoking", label: "Smoking" },
    { group: "personalSocial", key: "alcohol", label: "Alcohol" },
    { group: "personalSocial", key: "notes", label: "Other Notes" },
  ],
};

const DISEASE_FIELDS = ["name", "status", "firstRecorded", "lastConfirmed", "source", "conditionKey"];

function text(value) {
  return value === null || value === undefined ? "" : String(value);
}

function diseaseList(value) {
  return (Array.isArray(value) ? value : [])
    .filter((disease) => disease && typeof disease === "object")
    .map((disease) =>
      Object.fromEntries(
        DISEASE_FIELDS.map((field) => [
          field,
          field === "conditionKey" ? disease.conditionKey || null : text(disease[field]),
        ]),
      ),
    );
}

/** One section of a background, in the exact shape the API accepts for it. */
export function sliceBackground(background, section) {
  const bg = background || {};
  if (section === "medical") {
    return {
      currentDiseases: diseaseList(bg.currentDiseases),
      allergies: text(bg.allergies),
      hospitalizations: text(bg.hospitalizations),
      surgeries: text(bg.surgeries),
    };
  }

  const group = section === "family" ? "familyHistory" : "personalSocial";
  return {
    [group]: Object.fromEntries(
      BACKGROUND_SECTION_FIELDS[section].map(({ key }) => [key, text(bg[group]?.[key])]),
    ),
  };
}

/** Comparable form: trimmed text, and conditionKey left out (the server re-resolves it). */
function canonical(slice) {
  return JSON.stringify(slice, (key, value) => {
    if (key === "conditionKey") return undefined;
    return typeof value === "string" ? value.trim() : value;
  });
}

export function sectionChanged(before, after, section) {
  return canonical(sliceBackground(before, section)) !== canonical(sliceBackground(after, section));
}

/**
 * The staged update for an edited background, or null when nothing differs
 * from what was loaded. A section keeps the base revision it was first edited
 * at (from `previous`), so a background refetched mid-consultation cannot
 * quietly move the base past someone else's change.
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

  return Object.keys(sections).length ? { sections, baseRevisions } : null;
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

/** "Asthma (Controlled); Hypertension (Active)". */
export function formatDiseases(diseases) {
  return diseaseList(diseases)
    .filter((disease) => disease.name.trim())
    .map((disease) => (disease.status ? `${disease.name} (${disease.status})` : disease.name))
    .join("; ");
}

function readField(slice, field) {
  if (field.key === "currentDiseases") return formatDiseases(slice?.currentDiseases);
  const value = field.group ? slice?.[field.group]?.[field.key] : slice?.[field.key];
  return text(value).trim();
}

/** The fields of one section that differ between two backgrounds (or slices), as display text. */
export function backgroundChangeRows(before, after, section) {
  return BACKGROUND_SECTION_FIELDS[section]
    .map((field) => ({
      key: field.key,
      label: field.label,
      before: readField(before, field),
      after: readField(after, field),
    }))
    .filter((row) => row.before !== row.after);
}

/** The record API's spelling of a staged update, or undefined when there is none. */
export function toRecordBackgroundUpdate(update) {
  if (!editedSectionKeys(update).length) return undefined;
  return { sections: update.sections, base_revisions: update.baseRevisions };
}

/** The per-section conflicts of a 409 from the record save, or null for any other error. */
export function readBackgroundConflicts(error) {
  if (error?.status !== 409 || error?.payload?.code !== "PATIENT_BACKGROUND_CONFLICT") return null;
  return Array.isArray(error.payload.conflicts) ? error.payload.conflicts : [];
}

/**
 * Applies the clinician's choice per conflicting section: "mine" keeps their
 * edit and rebases it onto the latest revision, "latest" drops their edit.
 * Returns null when no edited section is left.
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

  return Object.keys(sections).length ? { sections, baseRevisions } : null;
}

/** Only sections the clinician edited can conflict; every one needs a choice before retrying. */
export function allConflictsResolved(conflicts, choices) {
  return (conflicts || []).every(({ section }) => ["mine", "latest"].includes(choices?.[section]));
}
