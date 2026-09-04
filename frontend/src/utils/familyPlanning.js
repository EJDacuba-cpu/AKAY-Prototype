/**
 * Standardised family planning method codes.
 *
 * The full label is what gets STORED (as familyPlanningData.previousMethod and
 * as maternalData.previousFpMethodUsed), so these strings are data, not just
 * display text - changing one changes what new records save and breaks
 * comparison with records saved before the change.
 *
 * Shared by every "previous method" dropdown - the Family Planning program form
 * and the prenatal record, on both the BHC and RHU pages - so that the same
 * clinical answer is stored identically wherever it is captured.
 */
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
