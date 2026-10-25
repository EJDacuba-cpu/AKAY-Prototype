/**
 * Prenatal (Maternal) form rules that shape what gets stored.
 *
 * Kept out of the page so the two that could silently corrupt a record - the
 * Risk Code flags and where this visit's TT/Td dose is filed - are testable.
 */

/**
 * The obstetric risk factors the midwife ticks by hand.
 *
 * Age and height risk are computed (utils/maternalRisk), and diseases, smoking
 * and alcohol are not asked here: a BHC worker does not confirm a disease, and
 * the Patient Profile already shows them. An item's `parent` names the Risk
 * Code D flag it belongs to. See applyRiskFactorChange.
 */
export const MATERNAL_RISK_GROUPS = [
  {
    key: "obstetric",
    eyebrow: "Pregnancy / Obstetric Risk Factors",
    options: [
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
];

/** Every key a new prenatal risk assessment may carry (ticked or computed). */
export const MATERNAL_RISK_KEYS = [
  "ageRisk",
  "heightRisk",
  "grandMultipara",
  "previousPregnancyComplications",
  "previousCs",
  "recurrentMiscarriageOrStillbirth",
  "postpartumHemorrhage",
];

/**
 * The risk assessment without keys the form no longer records. An older draft
 * or record can still carry them (diabetes, smoker, ...); they must not be
 * copied into a new record.
 */
export function sanitizeRiskAssessment(riskAssessment) {
  const source = riskAssessment || {};
  return Object.fromEntries(
    MATERNAL_RISK_KEYS.filter((key) => key in source).map((key) => [key, source[key]]),
  );
}

/** The Risk Code parent flag and the items that keep it set. */
export const MATERNAL_RISK_PARENTS = MATERNAL_RISK_GROUPS.flatMap((group) => group.options)
  .filter((option) => option.parent)
  .reduce((parents, option) => {
    (parents[option.parent] ||= []).push(option.key);
    return parents;
  }, {});

/**
 * Tick or untick one risk factor.
 *
 * An item that belongs to Risk Code D keeps that code's flag in step -
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

/** OB score components stored as separate counts, not one formatted string. */
export const OB_SCORE_TPAL_FIELDS = [
  { key: "term", label: "Term" },
  { key: "preterm", label: "Preterm" },
  { key: "abortion", label: "Abortion" },
  { key: "living", label: "Living" },
];

export const OB_SCORE_GP_FIELDS = [
  { key: "gravida", label: "Gravida (G)", placeholder: "e.g. 2" },
  { key: "para", label: "Para (P)", placeholder: "e.g. 1" },
];

/**
 * Empty prenatal payload. Shared by BHC and RHU so a new enrollment starts
 * from the same shape the official record already stores.
 */
export const EMPTY_MATERNAL_DATA = {
  lmp: "",
  pmp: "",
  cycleDuration: "",
  // Actual date of delivery, recorded on a Postpartum visit. Drives the
  // Care & Programs "Postpartum" -> "Completed" transition; EDD alone never
  // does. Optional - a Postpartum visit without it stays "Postpartum" with a
  // "Delivery date not recorded" flag on the patient's Care & Programs tab.
  deliveryDate: "",
  gravida: "",
  para: "",
  term: "",
  preterm: "",
  abortion: "",
  living: "",
  bmi: "",
  fht: "",
  treatment: "",
  previousFpMethodUsed: "",
  previousFpMethodOther: "",
  previousPregnancyHistory: [],
  expectedDeliveryDate: "",
  aog: "",
  riskAssessment: {
    ageRisk: false,
    heightRisk: false,
    grandMultipara: false,
    previousPregnancyComplications: false,
    previousCs: false,
    recurrentMiscarriageOrStillbirth: false,
    postpartumHemorrhage: false,
  },
  laboratoryResults: {
    hemoglobin: "",
    cbc: "",
    hbsag: "",
    bloodType: "",
    hiv: "",
    syphilis: "",
    urinalysis: "",
  },
  laboratoryResultDates: {
    hemoglobin: "",
    cbc: "",
    hbsag: "",
    bloodType: "",
    hiv: "",
    syphilis: "",
    urinalysis: "",
  },
  immunizationThisVisit: {
    type: "",
    doseStatus: "",
    dateGiven: "",
  },
  tetanusToxoidStatus: {
    tt1: "",
    tt2: "",
    tt3: "",
    tt4: "",
    tt5: "",
  },
  tetanusDiphtheriaStatus: {
    td1: "",
    td2: "",
    td3: "",
    td4: "",
    td5: "",
  },
  ultrasound: {
    result: "",
    dateDone: "",
  },
};

/** Visit-only prenatal fields. A continue visit starts these blank. */
export const PRENATAL_VISIT_FIELDS = ["fht", "treatment", "bmi"];

export function mergeMaternalData(data = {}, fallback = {}) {
  const source = data || {};
  const legacyRiskAssessment = source.riskAssessment || source.medicalHistory || {};
  const previousPregnancyHistory = Array.isArray(source.previousPregnancyHistory)
    ? source.previousPregnancyHistory
    : Array.isArray(source.previous_pregnancy_history)
      ? source.previous_pregnancy_history
      : [];
  return {
    ...EMPTY_MATERNAL_DATA,
    ...source,
    lmp: source.lmp || fallback.lmp || "",
    pmp: source.pmp || fallback.pmp || "",
    cycleDuration: source.cycleDuration || fallback.cycleDuration || "",
    gravida: source.gravida || fallback.gravida || "",
    para: source.para || fallback.para || "",
    term: source.term || fallback.term || "",
    preterm: source.preterm || fallback.preterm || "",
    abortion: source.abortion || fallback.abortion || "",
    living: source.living || fallback.living || "",
    bmi: source.bmi || fallback.bmi || "",
    fht: source.fht || fallback.fht || "",
    treatment: source.treatment || fallback.treatment || "",
    expectedDeliveryDate:
      source.expectedDeliveryDate || fallback.expectedDeliveryDate || "",
    aog: source.aog || fallback.aog || "",
    previousFpMethodUsed:
      source.previousFpMethodUsed ||
      source.previous_fp_method_used ||
      fallback.previousFpMethodUsed ||
      "",
    previousFpMethodOther:
      source.previousFpMethodOther ||
      source.previous_fp_method_other ||
      fallback.previousFpMethodOther ||
      "",
    previousPregnancyHistory,
    riskAssessment: {
      ...EMPTY_MATERNAL_DATA.riskAssessment,
      ...sanitizeRiskAssessment(legacyRiskAssessment),
    },
    laboratoryResults: {
      ...EMPTY_MATERNAL_DATA.laboratoryResults,
      ...(source.laboratoryResults || {}),
    },
    laboratoryResultDates: {
      ...EMPTY_MATERNAL_DATA.laboratoryResultDates,
      ...(source.laboratoryResultDates || {}),
    },
    immunizationThisVisit: {
      ...EMPTY_MATERNAL_DATA.immunizationThisVisit,
      ...(source.immunizationThisVisit || {}),
    },
    tetanusToxoidStatus: {
      ...EMPTY_MATERNAL_DATA.tetanusToxoidStatus,
      ...(source.tetanus_toxoid_status || {}),
      ...(source.tetanusToxoidStatus || {}),
    },
    tetanusDiphtheriaStatus: {
      ...EMPTY_MATERNAL_DATA.tetanusDiphtheriaStatus,
      ...(source.tetanus_diphtheria_status || {}),
      ...(source.tetanusDiphtheriaStatus || {}),
    },
    ultrasound: {
      ...EMPTY_MATERNAL_DATA.ultrasound,
      ...(source.ultrasound || {}),
    },
  };
}

export function computeEddFromLmp(lmp) {
  if (!lmp) return "";
  const lmpDate = new Date(lmp);
  if (Number.isNaN(lmpDate.getTime())) return "Invalid Date";
  const edd = new Date(lmpDate);
  edd.setDate(edd.getDate() + 7);
  edd.setMonth(edd.getMonth() - 3);
  edd.setFullYear(edd.getFullYear() + 1);
  return edd.toISOString().split("T")[0];
}

export function computeAogFromLmp(lmp, visitDate = new Date()) {
  if (!lmp) return "";
  const lmpDate = new Date(lmp);
  if (Number.isNaN(lmpDate.getTime())) return "Invalid Date";
  const visit = visitDate ? new Date(visitDate) : new Date();
  if (Number.isNaN(visit.getTime())) return "";
  const timeDiff = visit.getTime() - lmpDate.getTime();
  if (timeDiff < 0) return "Invalid (LMP is ahead of visit)";
  const totalDays = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  if (weeks > 42) return "Post-term (>42 Weeks)";
  const weekStr = `${weeks} week${weeks !== 1 ? "s" : ""}`;
  const dayStr = days > 0 ? ` and ${days} day${days > 1 ? "s" : ""}` : "";
  return `${weekStr}${dayStr}`;
}

/**
 * Pregnancy facts from an earlier prenatal record, with this-visit fields
 * cleared so a continue visit cannot copy FHT or today's dose.
 */
export function continuePrenatalPrefill(record = {}) {
  const data = mergeMaternalData(record.maternalData || record.maternal_data || {}, {
    expectedDeliveryDate: record.expectedDeliveryDate || "",
    aog: record.aog || "",
  });
  return {
    ...data,
    fht: "",
    treatment: "",
    bmi: "",
    immunizationThisVisit: { ...EMPTY_MATERNAL_DATA.immunizationThisVisit },
  };
}
