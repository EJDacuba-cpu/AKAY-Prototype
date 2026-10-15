/**
 * Allergy text that records the ABSENCE of allergies ("None reported", "NKDA",
 * "No known allergies"), so it must not raise an allergy alert. Whole-answer
 * match only: anything with more to say ("None reported by mother; penicillin
 * rash") stays an allergy. Blank text is unrecorded, not negative.
 */
export const NO_ALLERGY_PATTERN =
  /^(none(\s+(reported|known))?|n\/a|na|nka|nkda|no known(?:\s+(?:drug|food|medication))?\s+allerg(?:y|ies)|no allerg(y|ies)|-+)\.?$/i;

export function isNoAllergyText(text) {
  const value = String(text ?? "").trim();
  return Boolean(value) && NO_ALLERGY_PATTERN.test(value);
}
