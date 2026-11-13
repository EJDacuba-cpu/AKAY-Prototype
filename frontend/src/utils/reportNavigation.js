/**
 * Reports sidebar nav (4 children) + in-page TCL / Morbidity filters.
 * Engine category keys stay in bhcReporting / rhuReporting; this layer maps
 * sidebar + filters (+ legacy ?type= aliases) onto those engines.
 */

export const REPORT_SIDEBAR_ITEMS = Object.freeze([
  Object.freeze({ key: "referrals", slug: "referrals", label: "Referrals" }),
  Object.freeze({ key: "overview", slug: "overview", label: "Overview" }),
  Object.freeze({ key: "tcl", slug: "tcl", label: "TCL" }),
  Object.freeze({ key: "morbidity", slug: "morbidity", label: "Morbidity" }),
]);

export const TCL_PROGRAM_OPTIONS = Object.freeze([
  Object.freeze({ key: "epi", slug: "epi", label: "EPI / Immunization" }),
  Object.freeze({ key: "maternal", slug: "maternal", label: "Maternal Care" }),
  Object.freeze({ key: "nutrition", slug: "nutrition", label: "Nutrition" }),
  Object.freeze({ key: "family_planning", slug: "family-planning", label: "Family Planning" }),
]);

export const MORBIDITY_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ key: "morbidity", slug: "all-morbidity", label: "All Morbidity" }),
  Object.freeze({ key: "notifiable", slug: "notifiable", label: "Notifiable Diseases" }),
  Object.freeze({ key: "surveillance", slug: "surveillance", label: "Community Surveillance" }),
]);

const DEFAULT_NAV = "overview";
const DEFAULT_TCL = "epi";
const DEFAULT_MORBIDITY = "morbidity";

const NAV_ALIASES = Object.freeze({
  referrals: "referrals",
  "referral-reports": "referrals",
  overview: "overview",
  all: "overview",
  "all-categories": "overview",
  "patient-visits": "overview",
  patient_visits: "overview",
  tcl: "tcl",
  epi: "tcl",
  immunization: "tcl",
  "epi-target-client-list": "tcl",
  "child-health": "tcl",
  maternal: "tcl",
  "maternal-prenatal": "tcl",
  nutrition: "tcl",
  "nutrition-care": "tcl",
  "nutrition-report": "tcl",
  "family-planning": "tcl",
  family_planning: "tcl",
  morbidity: "morbidity",
  notifiable: "morbidity",
  "notifiable-diseases": "morbidity",
  "notifiable-disease": "morbidity",
  surveillance: "morbidity",
  "community-surveillance": "morbidity",
  "community-based-surveillance": "morbidity",
  // Legacy BHC follow-ups / tb report types folded into overview
  followups: "overview",
  "follow-ups": "overview",
  tb: "overview",
});

const TCL_ALIASES = Object.freeze({
  epi: "epi",
  immunization: "epi",
  "epi-target-client-list": "epi",
  "child-health": "epi",
  maternal: "maternal",
  "maternal-prenatal": "maternal",
  nutrition: "nutrition",
  "nutrition-care": "nutrition",
  "nutrition-report": "nutrition",
  "family-planning": "family_planning",
  family_planning: "family_planning",
});

const MORBIDITY_ALIASES = Object.freeze({
  morbidity: "morbidity",
  "all-morbidity": "morbidity",
  notifiable: "notifiable",
  "notifiable-diseases": "notifiable",
  "notifiable-disease": "notifiable",
  surveillance: "surveillance",
  "community-surveillance": "surveillance",
  "community-based-surveillance": "surveillance",
});

function rawType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

export function normalizeReportNav(value) {
  const raw = rawType(value);
  if (!raw) return DEFAULT_NAV;
  return NAV_ALIASES[raw] || REPORT_SIDEBAR_ITEMS.find((item) => item.slug === raw)?.key || DEFAULT_NAV;
}

export function normalizeTclProgram(value) {
  const raw = rawType(value);
  return TCL_ALIASES[raw] || TCL_PROGRAM_OPTIONS.find((item) => item.slug === raw)?.key || DEFAULT_TCL;
}

export function normalizeMorbidityFilter(value) {
  const raw = rawType(value);
  return (
    MORBIDITY_ALIASES[raw] ||
    MORBIDITY_FILTER_OPTIONS.find((item) => item.slug === raw)?.key ||
    DEFAULT_MORBIDITY
  );
}

/**
 * Seed in-page filter defaults from a legacy or current `?type=` value.
 */
export function seedReportFiltersFromType(type) {
  const raw = rawType(type);
  const nav = normalizeReportNav(raw);
  return {
    nav,
    tclProgram: nav === "tcl" ? (TCL_ALIASES[raw] ? normalizeTclProgram(raw) : DEFAULT_TCL) : DEFAULT_TCL,
    morbidityFilter:
      nav === "morbidity"
        ? MORBIDITY_ALIASES[raw]
          ? normalizeMorbidityFilter(raw)
          : DEFAULT_MORBIDITY
        : DEFAULT_MORBIDITY,
  };
}

/**
 * Engine category consumed by buildBhcReport / buildRhuReport.
 * @param {'bhc'|'rhu'} role
 */
export function resolveReportEngineCategory(
  type,
  { nav, tclProgram, morbidityFilter } = {},
  role = "bhc",
) {
  const raw = rawType(type);
  const selectedNav = nav || normalizeReportNav(raw);

  if (selectedNav === "referrals") return "referrals";

  if (selectedNav === "overview") {
    if (role === "rhu") {
      // Preserve dedicated patient-visits engine when that legacy URL is open.
      if (raw === "patient-visits" || raw === "patient_visits") return "patient_visits";
      return "overview";
    }
    return "all";
  }

  if (selectedNav === "tcl") {
    return normalizeTclProgram(tclProgram || (TCL_ALIASES[raw] ? raw : DEFAULT_TCL));
  }

  if (selectedNav === "morbidity") {
    return normalizeMorbidityFilter(
      morbidityFilter || (MORBIDITY_ALIASES[raw] ? raw : DEFAULT_MORBIDITY),
    );
  }

  return role === "rhu" ? "overview" : "all";
}

export function reportNavLabel(nav) {
  return REPORT_SIDEBAR_ITEMS.find((item) => item.key === nav)?.label || "Reports";
}

export function tclProgramLabel(program) {
  return TCL_PROGRAM_OPTIONS.find((item) => item.key === program)?.label || "TCL";
}

export function morbidityFilterLabel(filter) {
  return MORBIDITY_FILTER_OPTIONS.find((item) => item.key === filter)?.label || "Morbidity";
}
