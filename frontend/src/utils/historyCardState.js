import { hasRecordedData } from "./patientHistory.js";
import { omitHiddenSocialKeys } from "./infantVisibility.js";

/** Only visible clinical fields decide whether a history card has an answer. */
export function hasHistoryCardData(background, section, omitFields = []) {
  const visible = section === "social"
    ? { ...background, personalSocial: omitHiddenSocialKeys(background?.personalSocial, omitFields) }
    : background;
  return hasRecordedData(visible, section);
}

/** Use saved history for defaults; typing into an empty form must not close it. */
export function historyCardEditing({ background, section, editing, hasErrors = false, omitFields = [] }) {
  if (hasErrors) return true;
  return editing ?? !hasHistoryCardData(background, section, omitFields);
}
