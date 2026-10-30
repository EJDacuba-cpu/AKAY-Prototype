/**
 * Actions Taken documentation for BHC General Consultation v2.
 *
 * Finalization needs non-whitespace text in Actions Taken for both initial
 * and follow-up visits. Medicines and structured services stay on their own
 * fields and are not copied here, but they do not replace this note.
 * Incomplete drafts may still be empty.
 */
export const ACTIONS_TAKEN_REQUIRED = "Document the actions taken.";

const text = (value) => String(value ?? "").trim();

export function hasDocumentedText(value) {
  return text(value) !== "";
}

/**
 * Text shown in Actions Taken after a draft resume. A stored
 * "No Intervention Performed" reason is kept as the note so older drafts
 * still open with their documentation.
 */
export function restoreActionsTakenText({
  treatmentNotes = "",
  noInterventionPerformed = false,
  noInterventionReason = "",
} = {}) {
  if (hasDocumentedText(treatmentNotes)) return String(treatmentNotes ?? "");
  if (noInterventionPerformed === true && hasDocumentedText(noInterventionReason)) {
    return String(noInterventionReason ?? "").trim();
  }
  return "";
}

/**
 * Blocking errors for Assessment & Care Plan. Blank or whitespace-only
 * notes fail; medicines and selected services do not skip this check.
 *
 * @returns {Record<string, string>}
 */
export function actionsTakenErrors({ treatmentNotes = "" } = {}) {
  return hasDocumentedText(treatmentNotes) ? {} : { actionsTaken: ACTIONS_TAKEN_REQUIRED };
}
