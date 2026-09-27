// Extensions are explicit so this module can be exercised directly by
// `node --test`, which does not resolve extensionless specifiers.

/**
 * Thresholds and schedule config behind Care Tracking status derivation
 * (see careTracking.js). Kept separate from the derivation logic so the
 * numbers can be reviewed and tuned without touching the rules that use them.
 */

/** Days from an actual delivery date until a maternal episode is Completed. */
export const POSTPARTUM_WINDOW_DAYS = 42;

/**
 * Recorded TB treatment outcomes (tb_data.outcome.status). Matches the NTP
 * treatment outcome categories. Until one is recorded, the Care Tracking card
 * shows the latest treatment phase (Registered / Intensive / Continuation)
 * instead of guessing an outcome from dates.
 */
export const TB_OUTCOMES = Object.freeze([
  { value: "cured", label: "Cured" },
  { value: "treatment_completed", label: "Treatment Completed" },
  { value: "treatment_failed", label: "Treatment Failed" },
  { value: "lost_to_follow_up", label: "Lost to Follow-up" },
  { value: "died", label: "Died" },
  { value: "not_evaluated", label: "Not Evaluated" },
]);

export const TB_OUTCOME_LABELS = Object.freeze(
  Object.fromEntries(TB_OUTCOMES.map(({ value, label }) => [value, label])),
);

/** TB outcomes that read as a successful close of treatment. */
export const TB_POSITIVE_OUTCOMES = Object.freeze([
  "cured",
  "treatment_completed",
]);

/** Adherence % below which the TB card switches to a warning tone. */
export const TB_ADHERENCE_WARNING_THRESHOLD = 90;

/**
 * The Fully Immunized Child (FIC) antigen set: the doses counted toward EPI
 * Care Tracking progress. A subset of `EPI_VACCINE_ROWS` in
 * healthRecordPrograms.js - that list also carries indicators (Newborn
 * Screening, CPAB, HPV) that are not part of the infant immunization series
 * and must not count toward "X of Y applicable doses".
 *
 * TODO(validate): confirm this set against the local FHSIS/EPI schedule
 * before relying on it for official reporting.
 */
export const EPI_INFANT_SCHEDULE = Object.freeze([
  "BCG",
  "HEPA B",
  "OPV 1",
  "OPV 2",
  "OPV 3",
  "PENTA 1",
  "PENTA 2",
  "PENTA 3",
  "PCV 1",
  "PCV 2",
  "PCV 3",
  "IPV 1",
  "IPV 2",
  "MCV 1",
  "MCV 2",
]);

/** Indicators tracked as separate chips, excluded from the infant dose count. */
export const EPI_EXTRA_INDICATORS = Object.freeze([
  "Newborn Screening",
  "CPAB",
  "HPV",
]);

/**
 * Age (in whole months) by which the full EPI_INFANT_SCHEDULE should be
 * complete for a "Fully Immunized Child" (FIC) label. Completing later than
 * this still counts as fully immunized, but is labeled "Completely Immunized
 * Child" (CIC) instead, per DOH EPI convention.
 *
 * TODO(validate): confirm against local FHSIS rules.
 */
export const EPI_FIC_AGE_LIMIT_MONTHS = 12;
