export const RHU_REPORT_CATEGORIES = Object.freeze([
  Object.freeze({ key: "overview", slug: "overview", label: "Overview" }),
  Object.freeze({ key: "patient_visits", slug: "patient-visits", label: "Patient Visits" }),
  Object.freeze({ key: "referrals", slug: "referrals", label: "Referral Reports" }),
  Object.freeze({ key: "epi", slug: "epi", label: "EPI / Immunization" }),
  Object.freeze({ key: "maternal", slug: "maternal", label: "Maternal Care" }),
  Object.freeze({ key: "family_planning", slug: "family-planning", label: "Family Planning" }),
  Object.freeze({ key: "nutrition", slug: "nutrition", label: "Nutrition" }),
  Object.freeze({ key: "morbidity", slug: "morbidity", label: "Morbidity" }),
  Object.freeze({ key: "notifiable", slug: "notifiable", label: "Notifiable Diseases" }),
  Object.freeze({ key: "surveillance", slug: "surveillance", label: "Surveillance" }),
]);

const DEFAULT_CATEGORY = "overview";

const CATEGORY_ALIASES = Object.freeze({
  overview: "overview",
  all: "overview",
  "all-categories": "overview",
  patient_visits: "patient_visits",
  "patient-visits": "patient_visits",
  referrals: "referrals",
  "referral-reports": "referrals",
  epi: "epi",
  immunization: "epi",
  "epi-target-client-list": "epi",
  "child-health": "epi",
  maternal: "maternal",
  "maternal-prenatal": "maternal",
  family_planning: "family_planning",
  "family-planning": "family_planning",
  nutrition: "nutrition",
  "nutrition-care": "nutrition",
  "nutrition-report": "nutrition",
  morbidity: "morbidity",
  notifiable: "notifiable",
  "notifiable-diseases": "notifiable",
  "notifiable-disease": "notifiable",
  surveillance: "surveillance",
  "community-surveillance": "surveillance",
  "community-based-surveillance": "surveillance",
});

export function normalizeRhuReportCategory(value) {
  const raw = String(value || DEFAULT_CATEGORY)
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  return (
    CATEGORY_ALIASES[raw] ||
    RHU_REPORT_CATEGORIES.find((item) => item.slug === raw)?.key ||
    DEFAULT_CATEGORY
  );
}
