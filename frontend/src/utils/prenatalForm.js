/**
 * Prenatal (Maternal) form rules that shape what gets stored.
 *
 * Kept out of the page so the two that could silently corrupt a record - the
 * Risk Code flags and where this visit's TT/Td dose is filed - are testable.
 */

/**
 * Prenatal risk factors, one flat checklist per column.
 *
 * Risk Code D (previous pregnancy complications) and Risk Code E (medical
 * conditions) are still recorded: an item's `parent` names the Risk Code flag
 * it belongs to. See applyRiskFactorChange.
 */
export const MATERNAL_RISK_GROUPS = [
  {
    key: "pregnancy",
    eyebrow: "Pregnancy / Obstetric Risk Factors",
    options: [
      { key: "ageRisk", label: "Age less than 18 or greater than 35" },
      { key: "heightRisk", label: "Being less than 145 (4'9\") tall" },
      { key: "grandMultipara", label: "Has a fourth (or more) baby (GRANDMULTI)" },
      { key: "previousCs", label: "Previous C/S", parent: "previousPregnancyComplications" },
      {
        key: "recurrentMiscarriageOrStillbirth",
        label: "3 consecutive miscarriages or still born",
        parent: "previousPregnancyComplications",
      },
      {
        key: "postpartumHemorrhage",
        label: "Post-partum hemorrhage",
        parent: "previousPregnancyComplications",
      },
    ],
  },
  {
    key: "medical",
    eyebrow: "Medical Conditions",
    options: [
      { key: "tuberculosis", label: "Tuberculosis", parent: "medicalConditions" },
      { key: "heartDisease", label: "Heart Disease", parent: "medicalConditions" },
      { key: "diabetes", label: "Diabetes", parent: "medicalConditions" },
      { key: "bronchialAsthma", label: "Bronchial Asthma", parent: "medicalConditions" },
      { key: "goiter", label: "Goiter", parent: "medicalConditions" },
    ],
  },
  {
    key: "other",
    eyebrow: "Other Important Information",
    options: [
      { key: "hypertensive", label: "Hypertensive" },
      { key: "alcoholUser", label: "Alcohol user" },
      { key: "smoker", label: "Smoker" },
    ],
  },
];

/** Each Risk Code parent flag and the items that keep it set. */
export const MATERNAL_RISK_PARENTS = MATERNAL_RISK_GROUPS.flatMap((group) => group.options)
  .filter((option) => option.parent)
  .reduce((parents, option) => {
    (parents[option.parent] ||= []).push(option.key);
    return parents;
  }, {});

/**
 * Tick or untick one risk factor.
 *
 * An item that belongs to Risk Code D or E keeps that code's flag in step -
 * set while any of its items is checked - so records still carry the Risk
 * Code exactly as before. A parent is only recomputed when one of ITS OWN
 * items changes, so a code an older record carried without any item is never
 * silently cleared by touching an unrelated checkbox.
 */
export function applyRiskFactorChange(riskAssessment = {}, key, checked) {
  const next = { ...(riskAssessment || {}), [key]: Boolean(checked) };
  for (const [parent, items] of Object.entries(MATERNAL_RISK_PARENTS)) {
    if (items.includes(key)) {
      next[parent] = items.some((item) => Boolean(next[item]));
    }
  }
  return next;
}

/** Prenatal laboratory tests, in the order the prenatal record lists them. */
export const MATERNAL_LAB_TESTS = [
  { key: "hemoglobin", label: "Hemoglobin" },
  { key: "cbc", label: "CBC" },
  { key: "hbsag", label: "HBsAg" },
  { key: "bloodType", label: "Blood Type" },
  { key: "hiv", label: "HIV" },
  { key: "syphilis", label: "Syphilis" },
  { key: "urinalysis", label: "Urinalysis" },
];
export const MATERNAL_LAB_TEST_KEYS = MATERNAL_LAB_TESTS.map((test) => test.key);

/**
 * The doses "Immunization This Visit" can record. TT and Td are two separate
 * 5-dose schedules; each option names the schedule its date is stored under.
 */
export const PRENATAL_IMMUNIZATION_OPTIONS = [
  ...[1, 2, 3, 4, 5].map((dose) => ({
    value: `tt${dose}`,
    label: `TT${dose} (Tetanus Toxoid)`,
    schedule: "tetanusToxoidStatus",
  })),
  ...[1, 2, 3, 4, 5].map((dose) => ({
    value: `td${dose}`,
    label: `Td${dose} (Tetanus-Diphtheria)`,
    schedule: "tetanusDiphtheriaStatus",
  })),
];

/**
 * The entry this visit's dose adds to one TT/Td schedule, or {}.
 *
 * Filing the dose under its schedule keeps the existing TT/Td history - and
 * everything that reads it - complete. Only a known dose WITH a date is filed;
 * earlier doses already on the record are left exactly as they are.
 */
export function thisVisitDoseEntry(immunizationThisVisit, schedule) {
  const option = PRENATAL_IMMUNIZATION_OPTIONS.find(
    (entry) => entry.value === immunizationThisVisit?.type,
  );
  const dateGiven = immunizationThisVisit?.dateGiven;
  return option?.schedule === schedule && dateGiven ? { [option.value]: dateGiven } : {};
}
