/**
 * Recovering the Patient History edits an old BHC draft staged, per
 * docs/superpowers/specs/2026-10-16-bhc-patient-background-design.md
 * ("Compatibility and recovery").
 *
 * BHC consultations stage Family / Past Medical / Social (and obstetric on
 * Prenatal) in `backgroundUpdate`. An old draft's leftover Education /
 * Past Occupations text can still be shown as a non-blocking notice.
 *
 * Education and Past Occupations are no longer background fields at the BHC
 * (Patient Information owns Education). Their staged values are shown as
 * recoverable text only; the server never writes them from a BHC save.
 *
 * Pure functions only - no React, no API.
 */

import {
  BACKGROUND_SECTION_FIELDS,
  BACKGROUND_SECTION_KEYS,
  BACKGROUND_SECTION_LABELS,
  backgroundChangeRows,
  editedSectionKeys,
  reviewedSectionKeys,
  sliceBackground,
} from "./backgroundUpdate.js";
import { BHC_HIDDEN_SOCIAL_FIELDS } from "./backgroundEditing.js";
import { historyErrorMessages } from "./historyStep.js";

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

/** Staged Education / Past Occupations text that differs from what is saved. */
function removedFieldText(update, background) {
  const staged = update?.sections?.social;
  if (!staged) return [];
  const saved = sliceBackground(background, "social");
  return BACKGROUND_SECTION_FIELDS.social
    .filter((field) => BHC_HIDDEN_SOCIAL_FIELDS.includes(field.key))
    .map((field) => ({ key: field.key, label: field.label, value: text(field.read(staged)), saved: text(field.read(saved)) }))
    .filter((row) => row.value && row.value !== row.saved)
    .map(({ key, label, value }) => ({ key, label, value }));
}

/**
 * What an old draft's staged update holds, for the recovery panel, or null
 * when there is nothing to show:
 *  - `sections`: each edited section with its clinical rows (before -> after);
 *    Education / Past Occupations are not clinical rows here.
 *  - `reviewed`: section labels the old draft marked "No changes".
 *  - `removedText`: staged Education / Past Occupations text (recoverable only).
 *  - `hasClinicalChanges`: whether any section row would change the background.
 */
export function legacyBackgroundRecovery(update, background) {
  if (!update) return null;

  const sections = editedSectionKeys(update)
    .map((section) => ({
      section,
      label: BACKGROUND_SECTION_LABELS[section],
      rows: backgroundChangeRows(sliceBackground(background, section), update.sections[section], section).filter(
        (row) => section !== "social" || !BHC_HIDDEN_SOCIAL_FIELDS.includes(row.key),
      ),
    }));
  const reviewed = reviewedSectionKeys(update)
    .filter((section) => BACKGROUND_SECTION_KEYS.includes(section))
    .map((section) => BACKGROUND_SECTION_LABELS[section]);
  const removedText = removedFieldText(update, background);

  if (!sections.length && !reviewed.length && !removedText.length) return null;
  return { sections, reviewed, removedText, hasClinicalChanges: sections.some((entry) => entry.rows.length > 0) };
}

/** Staged background edits now belong on Interview; they never block finalize. */
export function legacyRecoveryErrors() {
  return {};
}

/** Correct only an already-staged section; retain the original conflict revisions. */
export function correctLegacySection(update, section, value) {
  if (!editedSectionKeys(update).includes(section)) return update;
  const corrected = section === "social"
    ? {
        ...value,
        personalSocial: {
          ...value.personalSocial,
          education: update.sections.social.personalSocial?.education,
          pastOccupations: update.sections.social.personalSocial?.pastOccupations,
        },
      }
    : value;
  return { ...update, sections: { ...update.sections, [section]: corrected } };
}

/**
 * The clinician's explicit choice: "keep" leaves the staged update as it is
 * (it saves with this consultation, through the record's revision check);
 * "discard" removes it. Anything else changes nothing and is not an answer.
 */
export function resolveLegacyRecovery(update, choice) {
  if (choice === "keep") return { update, acknowledged: true };
  if (choice === "discard") return { update: null, acknowledged: true };
  return { update, acknowledged: false };
}

/** The 422 lines for the staged background update only. */
export function backgroundUpdateErrorMessages(errors) {
  return historyErrorMessages(
    Object.fromEntries(Object.entries(errors || {}).filter(([key]) => key.startsWith("background_update"))),
  );
}
