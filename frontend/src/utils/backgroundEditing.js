/**
 * Editing the Patient Background outside a consultation (BHC), per
 * docs/superpowers/specs/2026-10-16-bhc-patient-background-design.md.
 *
 * One section is edited at a time. Its base revision is captured when Edit
 * starts and kept in the edit, so a background refetched meanwhile can neither
 * reset the typed values nor move the base past someone else's save. Pure
 * functions only - no React, no API.
 */

import {
  BACKGROUND_SECTION_FIELDS,
  BACKGROUND_SECTION_LABELS,
  readBackgroundConflicts,
  sectionChanged,
  sliceBackground,
  toRecordBackgroundUpdate,
} from "./backgroundUpdate.js";
import { historyErrorMessages } from "./historyStep.js";
import { sectionVisibility } from "./patientHistory.js";

export const BACKGROUND_UPDATE_PERMISSION = "clinical.background.update";

/**
 * Personal & Social fields owned by Patient Information (Education) or kept
 * only as history (Past Occupations). BHC editing never shows or sends them;
 * the server preserves the saved values.
 */
export const BHC_HIDDEN_SOCIAL_FIELDS = ["education", "pastOccupations"];

export const BACKGROUND_SAVED_TITLE = "Background saved";
const SAVE_FALLBACK = "Unable to save this section. Please try again.";

/** Only a BHC user explicitly granted the update duty (which needs history reading) may edit. */
export function canUpdateBackground(user) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return (
    user?.role === "bhc" &&
    permissions.includes("clinical.history") &&
    permissions.includes(BACKGROUND_UPDATE_PERMISSION)
  );
}

function withoutHiddenSocial(slice, section) {
  if (section !== "social" || !slice?.personalSocial) return slice;
  const personalSocial = { ...slice.personalSocial };
  BHC_HIDDEN_SOCIAL_FIELDS.forEach((key) => delete personalSocial[key]);
  return { ...slice, personalSocial };
}

/** A new edit of one section: its saved values and the revision they are at. */
export function startSectionEdit(background, section) {
  const slice = sliceBackground(background, section);
  return {
    section,
    baseRevision: Number(background?.revisions?.[section]) || 0,
    initial: slice,
    value: slice,
  };
}

/** The edit with the values as typed (the section form's `onChange` slice). */
export function updateSectionEdit(edit, value) {
  return { ...edit, value };
}

/** Whether the typed values differ from what the edit started from (hidden fields ignored). */
export function isSectionEditDirty(edit) {
  if (!edit) return false;
  return sectionChanged(
    withoutHiddenSocial(sliceBackground(edit.initial, edit.section), edit.section),
    withoutHiddenSocial(sliceBackground(edit.value, edit.section), edit.section),
    edit.section,
  );
}

/**
 * The PATCH /patients/{id}/background `background_update` body: only this
 * section, blank rows dropped, Education / Past Occupations left out, with
 * the revision captured when editing started.
 */
export function sectionSavePayload(edit) {
  const slice = withoutHiddenSocial(sliceBackground(edit.value, edit.section), edit.section);
  const record = toRecordBackgroundUpdate({
    sections: { [edit.section]: slice },
    baseRevisions: { [edit.section]: Number(edit.baseRevision) || 0 },
    reviewed: [],
  });
  return { sections: record.sections, base_revisions: record.base_revisions };
}

/** This section's entry of a 409 conflict, or null for any other error. */
export function sectionConflict(error, section) {
  const conflicts = readBackgroundConflicts(error);
  return conflicts?.find((conflict) => conflict?.section === section) || null;
}

/**
 * The clinician's explicit answer to a conflict. "mine" keeps the typed values
 * and rebases them onto the latest revision (they still press Save); "latest"
 * reloads the latest saved values into the form. Never saves by itself.
 */
export function resolveSectionConflict(edit, conflict, choice) {
  const latest = sliceBackground(conflict?.current, edit.section);
  const revision = Number(conflict?.revision) || 0;
  if (choice === "latest") return { ...edit, baseRevision: revision, initial: latest, value: latest };
  if (choice === "mine") return { ...edit, baseRevision: revision, initial: latest };
  return edit;
}

/** Readable lines for a failed save: 422 field errors, else the server's message. */
export function backgroundSaveErrorLines(error) {
  if (error?.status === 422 && error.errors && typeof error.errors === "object") {
    const flat = Object.fromEntries(
      Object.entries(error.errors).map(([key, messages]) => [
        key,
        Array.isArray(messages) ? messages[0] : String(messages ?? ""),
      ]),
    );
    const lines = historyErrorMessages(flat);
    if (lines.length) return lines;
  }
  const message = String(error?.message || "").trim();
  return [message || SAVE_FALLBACK];
}

/**
 * What a successful save shows: with an open consultation draft for the
 * patient, the Background saved modal (Stay on Background / Continue
 * Consultation); otherwise a toast.
 */
export function backgroundSavedFeedback({ draft, section }) {
  if (!draft) return { kind: "toast", message: BACKGROUND_SAVED_TITLE };
  return {
    kind: "modal",
    title: BACKGROUND_SAVED_TITLE,
    message: `${BACKGROUND_SECTION_LABELS[section] || "Patient Background"} was updated. Your consultation is still open.`,
  };
}

/**
 * The Consultation in progress banner depends on the patient's open draft
 * only - not on navigation state and not on the editing duty.
 */
export function consultationBannerVisible({ draft }) {
  return Boolean(draft);
}

function tabOf(location) {
  return new URLSearchParams(location?.search || "").get("tab") || "";
}

/** Leaving Patient Background (another page or tab) with unsaved changes asks first. */
export function shouldBlockBackgroundLeave({ dirty, currentLocation, nextLocation }) {
  if (!dirty) return false;
  return (
    nextLocation?.pathname !== currentLocation?.pathname || tabOf(nextLocation) !== tabOf(currentLocation)
  );
}

/** Field keys the read-only Patient History reference shows per section (spec field mapping table). */
const REFERENCE_FIELDS = {
  medical: ["currentDiseases", "allergies", "hospitalizations"],
  family: ["familyHistory"],
  social: ["smoking", "alcohol", "diet", "sexual", "environment"],
  obstetric: ["cycle", "symptoms", "pregnancies"],
};

export const REFERENCE_SECTION_TITLES = {
  medical: "Past Medical History",
  family: "Family Conditions",
  social: "Lifestyle & Environment",
  obstetric: "Obstetric & Menstrual History",
};

function referenceRows(background, section, keys) {
  return BACKGROUND_SECTION_FIELDS[section]
    .filter((field) => keys.includes(field.key))
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: String(field.read(background || {}) || "").trim(),
    }));
}

/**
 * The reference's sections and rows: `value` is display text, "" when not
 * recorded. Education and Past Occupations are never included. Obstetric &
 * Menstrual History is included only when Section V is visible for the patient.
 */
export function historyReferenceSections(background, { patient, today } = {}) {
  const sections = ["medical", "family", "social"].map((section) => ({
    key: section,
    title: REFERENCE_SECTION_TITLES[section],
    rows: referenceRows(background, section, REFERENCE_FIELDS[section]),
  }));
  if (sectionVisibility(patient, today).obstetric !== "hidden") {
    sections.push({
      key: "obstetric",
      title: REFERENCE_SECTION_TITLES.obstetric,
      rows: referenceRows(background, "obstetric", REFERENCE_FIELDS.obstetric),
    });
  }
  return sections;
}
