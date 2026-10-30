/**
 * Family planning reference data and the sex rule that applies to it.
 *
 * Every option label here is what gets STORED on the record, not just what is
 * displayed, so these strings are data: changing one changes what new records
 * save and breaks comparison with records saved before the change.
 */

/**
 * Family planning methods that only apply to a female client.
 *
 * Family Planning as a whole is NOT female-only - Condom and NSV (No-Scalpel
 * Vasectomy) are male methods - so the sex restriction belongs here, on the
 * method, rather than on the classification.
 *
 * The patterns rather than exact labels because the same method is written
 * several ways across the app - "DMPA", "INJ — DMPA or CIC (Injectable)",
 * "Pills-COC", "IUD-PP" all have to resolve to the same restriction, and older
 * records still hold the legacy short labels ("Pills", "IUD", "BTL").
 */
const FEMALE_ONLY_FP_METHODS = [
  { label: "DMPA / Injectable", pattern: /dmpa|\bcic\b|inject/ },
  { label: "Pills", pattern: /pill/ },
  { label: "Implant", pattern: /implant|\bimp\b/ },
  { label: "IUD", pattern: /\biud\b/ },
  { label: "LAM", pattern: /\blam\b|lactational/ },
  {
    label: "Natural Family Planning",
    pattern:
      /natural family planning|\bnfp\b|basal body|cervical mucus|symptothermal|standard days/,
  },
  { label: "BTL", pattern: /\bbtl\b|tubal ligation|female steril/ },
];

/** Methods a male client can be recorded under. Checked before the list above. */
const MALE_APPLICABLE_FP_METHOD_PATTERN =
  // \b before "male" matters: without it "female sterilization" matches.
  /condom|\bcon\b|\bnsv\b|vasectomy|\bmale steril|\bmstr\b/;

export const MALE_FP_METHOD_MESSAGE =
  "This method is not applicable for a male patient. Please choose Condom, NSV, or another applicable method.";

function normalizeFpMethod(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the method can only be provided to a female client.
 *
 * An unrecognised value ("Other", or free text a worker typed) is NOT treated
 * as female-only: the restriction exists to stop an obvious mismatch, not to
 * reject anything the list does not know about.
 */
export function isFemaleOnlyFpMethod(method) {
  const normalized = normalizeFpMethod(method);
  if (!normalized) return false;
  if (MALE_APPLICABLE_FP_METHOD_PATTERN.test(normalized)) return false;

  return FEMALE_ONLY_FP_METHODS.some(({ pattern }) => pattern.test(normalized));
}

/** The method options a given patient may be offered. */
export function getApplicableFpMethods(methods = [], { isMale = false } = {}) {
  return isMale ? methods.filter((m) => !isFemaleOnlyFpMethod(m)) : methods;
}

/**
 * Submission guard. Returns the error message, or "" when the pairing is fine.
 */
export function getFpMethodRestriction({ method, isMale = false } = {}) {
  return isMale && isFemaleOnlyFpMethod(method) ? MALE_FP_METHOD_MESSAGE : "";
}

/**
 * Type of client, using the FP record's own codes. Stored as the full label,
 * same as the method options below.
 */
export const FP_CLIENT_TYPE_OPTIONS = [
  "NA — New Acceptors",
  "CU — Current Users",
  "OA — Other Acceptors",
  "CU-CM — Changing Method",
  "CU-CC — Changing Clinic",
  "CU-RS — Restarter",
];

/** Where the client obtained the service. */
export const FP_SOURCE_OPTIONS = ["Public", "Private"];

/**
 * Standardised method codes, shared by every method dropdown: "Method Used /
 * Accepted" and "Previous Method" on the Family Planning form, and "Previous FP
 * Method Used" on the prenatal record, across both the BHC and RHU pages - so
 * the same clinical answer is stored identically wherever it is captured.
 */
export function formatFpMethodLabel(method, other = "") {
  const value = String(method || "").trim();
  if (!value) return "";
  if (value === "Other") return String(other || "").trim() || "Other";
  return value;
}

function obstetricHistoryFields(background = {}) {
  const slice = background?.obstetric;
  if (!slice || typeof slice !== "object") return {};
  if (slice.previousFpMethod != null || slice.previousFpMethodOther != null || slice.menstrualStatus != null || slice.menarcheAge != null) {
    return slice;
  }
  return slice.obstetric && typeof slice.obstetric === "object" ? slice.obstetric : {};
}

/**
 * Longitudinal previous FP method: Patient History first, then this visit's
 * leftover prenatal field, then the latest finalized maternal or FP record.
 * Never writes history; callers snapshot the resolved value onto the record.
 */
export function resolveHistoricalFpMethod({
  background,
  maternalData,
  records = [],
} = {}) {
  const history = obstetricHistoryFields(background);
  const historyLabel = formatFpMethodLabel(history.previousFpMethod, history.previousFpMethodOther);
  if (historyLabel) {
    return {
      method: String(history.previousFpMethod || "").trim(),
      other: String(history.previousFpMethodOther || "").trim(),
      label: historyLabel,
    };
  }

  const maternalMethod = maternalData?.previousFpMethodUsed || maternalData?.previous_fp_method_used || "";
  const maternalOther = maternalData?.previousFpMethodOther || maternalData?.previous_fp_method_other || "";
  const maternalLabel = formatFpMethodLabel(maternalMethod, maternalOther);
  if (maternalLabel) {
    return {
      method: String(maternalMethod).trim(),
      other: String(maternalOther).trim(),
      label: maternalLabel,
    };
  }

  const list = Array.isArray(records) ? records : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const record = list[index] || {};
    const maternal = record.maternalData || record.maternal_data || {};
    const fromMaternal = formatFpMethodLabel(
      maternal.previousFpMethodUsed || maternal.previous_fp_method_used,
      maternal.previousFpMethodOther || maternal.previous_fp_method_other,
    );
    if (fromMaternal) {
      return {
        method: String(maternal.previousFpMethodUsed || maternal.previous_fp_method_used || "").trim(),
        other: String(maternal.previousFpMethodOther || maternal.previous_fp_method_other || "").trim(),
        label: fromMaternal,
      };
    }
    const familyPlanning = record.familyPlanningData || record.family_planning_data || {};
    const fromFp = formatFpMethodLabel(familyPlanning.previousMethod || familyPlanning.previous_method);
    if (fromFp) {
      return {
        method: String(familyPlanning.previousMethod || familyPlanning.previous_method || "").trim(),
        other: "",
        label: fromFp,
      };
    }
  }

  return { method: "", other: "", label: "" };
}

export const PREVIOUS_FP_METHOD_OPTIONS = [
  "NONE — None / New Acceptor",
  "FSTR/BTL — Female Sterilization / Bilateral Tubal Ligation",
  "MSTR/NSV — Male Sterilization / No-Scalpel Vasectomy",
  "CON — Condom",
  "Pills-POP — Progestin Only Pills",
  "Pills-COC — Combined Oral Contraceptives",
  "INJ — DMPA or CIC (Injectable)",
  "IMP — Single rod sub-dermal Implant",
  "IUD-I — IUD Interval",
  "IUD-PP — IUD Postpartum",
  "NFP-LAM — Lactational Amenorrhea Method",
  "NFP-BBT — Basal Body Temperature",
  "NFP-CMM — Cervical Mucus Method",
  "NFP-STM — Symptothermal Method",
  "NFP-SDM — Standard Days Method",
];
