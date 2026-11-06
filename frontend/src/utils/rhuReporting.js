import { buildBhcReport, isDateInReportPeriod, trendSeries } from "./bhcReporting.js";
import { normalizeDateValue } from "./filterUtils.js";

const CHART_COLORS = {
  brand: "var(--color-brand-600)",
  ink: "var(--color-ink-700)",
  info: "var(--color-info-500)",
  soft: "var(--color-brand-300)",
  muted: "var(--color-neutral-400)",
};

const CLINICAL_PROGRAM_LABELS = Object.freeze([
  "EPI doses",
  "Maternal consultations",
  "FP services",
  "Nutrition enrollments",
]);

const CLINICAL_PROGRAM_UNITS = Object.freeze({
  "EPI doses": "doses",
  "Maternal consultations": "consultations",
  "FP services": "services",
  "Nutrition enrollments": "enrollments",
});

const CLOSE_REASON_MISTAKE = "checked_in_by_mistake";
const CLOSE_REASON_CONSULTATION_COMPLETED = "consultation_completed";

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

function isReferredVisit(visit) {
  if (String(visit?.source || "").toLowerCase() === "referral") return true;
  if (visit?.referral?.id != null) return true;
  if (visit?.referral_id != null && visit.referral_id !== "") return true;
  return false;
}

function visitInPatientMetricsCohort(visit, period) {
  if (visit?.close_reason === CLOSE_REASON_MISTAKE) return false;
  return isDateInReportPeriod(visit?.checked_in_at, period);
}

function areaChart(title, description, period, data, xKey, valueKey, seriesLabel) {
  return {
    kind: "area",
    title,
    description,
    periodLabel: period.label,
    data,
    xKey,
    valueKey,
    seriesLabel,
    config: { [valueKey]: { label: seriesLabel, color: CHART_COLORS.brand } },
  };
}

function barChart(title, description, period, data, xKey, valueKey, seriesLabel, color = CHART_COLORS.ink) {
  return {
    kind: "bar",
    title,
    description,
    periodLabel: period.label,
    data,
    xKey,
    valueKey,
    seriesLabel,
    config: { [valueKey]: { label: seriesLabel, color } },
  };
}

function donutChart(title, description, period, data, seriesLabel) {
  const palette = [CHART_COLORS.brand, CHART_COLORS.ink, CHART_COLORS.info, CHART_COLORS.soft, CHART_COLORS.muted];
  const colored = (Array.isArray(data) ? data : []).map((item, index) => {
    const key = String(item.label || "item")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `item-${index}`;
    return {
      ...item,
      key,
      fill: palette[index % palette.length],
    };
  });
  return {
    kind: "donut",
    title,
    description,
    periodLabel: period.label,
    data: colored,
    xKey: "label",
    valueKey: "value",
    seriesLabel,
    config: Object.fromEntries(colored.map((item) => [item.key, { label: item.label, color: item.fill }])),
  };
}

/** Walk-in vs referred counts per day — same eligible cohort as Patient Visits. */
function visitSourceTrend(cohort, period) {
  const base = trendSeries([], period);
  const walkInByDay = new Map(base.map((row) => [row.date, 0]));
  const referredByDay = new Map(base.map((row) => [row.date, 0]));

  for (const visit of cohort) {
    const date = normalizeDateValue(visit?.checked_in_at);
    if (!walkInByDay.has(date)) continue;
    if (isReferredVisit(visit)) {
      referredByDay.set(date, referredByDay.get(date) + 1);
    } else {
      walkInByDay.set(date, walkInByDay.get(date) + 1);
    }
  }

  return base.map((row) => ({
    date: row.date,
    label: row.label,
    walkIn: walkInByDay.get(row.date) || 0,
    referred: referredByDay.get(row.date) || 0,
  }));
}

function clinicalProgramBars(clinicalAll) {
  const activity = (clinicalAll?.charts || []).find((chart) => chart.title === "Category activity");
  const rows = Array.isArray(activity?.data) ? activity.data : [];
  return CLINICAL_PROGRAM_LABELS.map((label) => {
    const match = rows.find((row) => row.label === label);
    return {
      label,
      value: Number(match?.value) || 0,
      unit: CLINICAL_PROGRAM_UNITS[label] || "count",
    };
  });
}

function countRecordedDiagnoses(clinicalAll) {
  const morbidity = Number(clinicalAll?.cards?.find((item) => item.key === "morbidity")?.value) || 0;
  const notifiable = Number(clinicalAll?.cards?.find((item) => item.key === "notifiable")?.value) || 0;
  return morbidity + notifiable;
}

export function buildPatientVisitMetrics(visits, period) {
  const cohort = (Array.isArray(visits) ? visits : []).filter((visit) =>
    visitInPatientMetricsCohort(visit, period),
  );
  let walkIn = 0;
  let referred = 0;
  let completedConsultations = 0;

  for (const visit of cohort) {
    if (isReferredVisit(visit)) {
      referred += 1;
    } else {
      walkIn += 1;
    }
    if (visit.close_reason === CLOSE_REASON_CONSULTATION_COMPLETED) {
      completedConsultations += 1;
    }
  }

  const total = cohort.length;
  const trend = trendSeries(
    cohort.map((visit) => visit.checked_in_at),
    period,
  );
  const sourceBreakdown = [
    { label: "Walk-in", value: walkIn },
    { label: "Referred", value: referred },
  ].filter((item) => item.value > 0);

  const summaryRows = [
    { label: "Total visits", value: total, note: "Queue check-ins in period; mistakes excluded" },
    { label: "Walk-in", value: walkIn, note: "Visits without a linked referral" },
    { label: "Referred", value: referred, note: "Referral source or linked referral id" },
    {
      label: "Completed consultations",
      value: completedConsultations,
      note: "Closed with consultation completed",
    },
  ];

  const charts = [
    areaChart(
      "Check-ins over the period",
      "Each visit is counted once on its check-in date.",
      period,
      trend,
      "label",
      "value",
      "Visits",
    ),
    barChart(
      "Walk-in vs referred",
      "Source mix for visits checked in during this period.",
      period,
      sourceBreakdown.length ? sourceBreakdown : [{ label: "No visits", value: 0 }],
      "label",
      "value",
      "Visits",
    ),
  ];

  return {
    total,
    walkIn,
    referred,
    completedConsultations,
    trend,
    summaryRows,
    charts,
  };
}

function normalizeReferralStatus(status) {
  const original = String(status || "").trim();
  if (!original) return "Pending";

  const raw = original.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (raw === "pending") return "Pending";
  if (["received", "for monitoring"].includes(raw)) return "Received";
  if (raw === "no show") return "No-Show";
  if (["completed", "complete", "done"].includes(raw)) return "Completed";
  return original;
}

// Mirrors bhcReporting getReferralDate; expects normalized list items (date / referralDateTime).
function getReferralDate(referral = {}) {
  return (
    referral.dateOfReferral ||
    referral.date_of_referral ||
    referral.referralDate ||
    referral.date ||
    referral.referralDateTime ||
    referral.createdAt ||
    referral.created_at ||
    ""
  );
}

function stringLabel(value) {
  return typeof value === "string" ? value.trim() : "";
}

function objectName(value) {
  if (!value || typeof value !== "object") return "";
  return stringLabel(value.name);
}

// Prefer normalized referringHci. Laravel relations stay objects on barangay_health_center.
function getReferralSourceLabel(referral = {}) {
  const candidates = [
    stringLabel(referral.referringHci),
    objectName(referral.barangay_health_center),
    objectName(referral.barangayHealthCenter),
    stringLabel(referral.originating_facility),
    stringLabel(referral.barangay_health_center),
    stringLabel(referral.from_facility),
    stringLabel(referral.barangay),
  ];
  return candidates.find(Boolean) || "";
}

function referralsBySource(cohort) {
  const buckets = new Map();
  for (const referral of cohort) {
    const label = getReferralSourceLabel(referral) || "Unspecified";
    if (!buckets.has(label)) {
      buckets.set(label, { label, value: 0, completed: 0 });
    }
    const row = buckets.get(label);
    row.value += 1;
    if (normalizeReferralStatus(referral.status) === "Completed") {
      row.completed += 1;
    }
  }
  return [...buckets.values()].sort(
    (a, b) => b.value - a.value || a.label.localeCompare(b.label),
  );
}

export function buildIncomingReferralMetrics(referrals, period) {
  const cohort = (Array.isArray(referrals) ? referrals : []).filter((referral) =>
    isDateInReportPeriod(getReferralDate(referral), period),
  );
  const bySource = referralsBySource(cohort);
  const referringBhcs = new Set(
    cohort
      .map((referral) => getReferralSourceLabel(referral))
      .filter(Boolean),
  ).size;
  let completedCases = 0;
  for (const referral of cohort) {
    if (normalizeReferralStatus(referral.status) === "Completed") {
      completedCases += 1;
    }
  }
  const total = cohort.length;
  const trend = trendSeries(
    cohort.map((referral) => getReferralDate(referral)),
    period,
  );
  const summaryRows = bySource.map((row) => ({
    label: row.label,
    value: row.value,
    note: `${row.completed} completed`,
  }));
  const charts = [
    barChart(
      "Referrals by Barangay / BHC",
      "Incoming referrals submitted during this period, grouped by source facility.",
      period,
      bySource.length ? bySource : [{ label: "No referrals", value: 0 }],
      "label",
      "value",
      "Referrals",
      CHART_COLORS.info,
    ),
  ];

  return {
    total,
    referringBhcs,
    completedCases,
    bySource,
    trend,
    summaryRows,
    charts,
  };
}

const CLINICAL_CATEGORIES = new Set([
  "epi",
  "maternal",
  "family_planning",
  "nutrition",
  "morbidity",
  "notifiable",
  "surveillance",
]);

function categoryMeta(key) {
  return RHU_REPORT_CATEGORIES.find((item) => item.key === key) || RHU_REPORT_CATEGORIES[0];
}

function card(key, label, value, hint) {
  return { key, label, value: Number(value) || 0, hint };
}

function reportView({ category, period, ageGroup = "all", notes = [], cards, charts, summary }) {
  const meta = categoryMeta(category);
  return {
    category,
    categoryLabel: meta.label,
    period,
    ageGroup,
    notes,
    cards,
    charts,
    summary,
    empty: cards.every((item) => !Number(item.value)),
    printRows: summary,
  };
}

// Facility id is not on visit or referral payloads. Isolation is the API's RHU scope;
// this builder filters by period and category only.
export function buildRhuReport({
  visits = [],
  patients = [],
  records = [],
  referrals = [],
  category = "overview",
  period,
  ageGroup = "all",
} = {}) {
  const selected = normalizeRhuReportCategory(category);

  if (CLINICAL_CATEGORIES.has(selected)) {
    const clinical = buildBhcReport({
      patients,
      records,
      referrals: [],
      category: selected,
      period,
      ageGroup,
    });
    return {
      ...clinical,
      category: selected,
      categoryLabel: categoryMeta(selected).label,
    };
  }

  if (selected === "patient_visits") {
    const metrics = buildPatientVisitMetrics(visits, period);
    return reportView({
      category: selected,
      period,
      ageGroup,
      cards: [
        card("total_visits", "Total Visits", metrics.total, "Queue check-ins in period; mistakes excluded"),
        card("walk_in", "Walk-in", metrics.walkIn, "Visits without a linked referral"),
        card("referred", "Referred", metrics.referred, "Referral source or linked referral id"),
        card(
          "completed_consultations",
          "Completed Consultations",
          metrics.completedConsultations,
          "Closed with consultation completed",
        ),
      ],
      charts: metrics.charts,
      summary: metrics.summaryRows,
    });
  }

  if (selected === "referrals") {
    const metrics = buildIncomingReferralMetrics(referrals, period);
    return reportView({
      category: selected,
      period,
      ageGroup,
      cards: [
        card("total_referrals", "Total Referrals", metrics.total, "Incoming referrals submitted in period"),
        card("referring_bhcs", "Referring BHCs", metrics.referringBhcs, "Distinct source facilities"),
        card("completed_cases", "Completed Cases", metrics.completedCases, "Verified completed workflow status"),
      ],
      charts: metrics.charts,
      summary: metrics.summaryRows,
    });
  }

  const visitMetrics = buildPatientVisitMetrics(visits, period);
  const referralMetrics = buildIncomingReferralMetrics(referrals, period);
  const clinicalAll = buildBhcReport({
    patients,
    records,
    referrals: [],
    category: "all",
    period,
    ageGroup,
  });
  const recordedDiagnoses = countRecordedDiagnoses(clinicalAll);
  const programBars = clinicalProgramBars(clinicalAll);
  const visitCohort = (Array.isArray(visits) ? visits : []).filter((visit) =>
    visitInPatientMetricsCohort(visit, period),
  );
  const sourceTrend = visitSourceTrend(visitCohort, period);
  const distributionSlices = [
    { label: "Walk-in", value: visitMetrics.walkIn },
    { label: "Referred", value: visitMetrics.referred },
  ].filter((item) => item.value > 0);

  const visitTrend = {
    kind: "multi-area",
    title: "Patient Visit Trends",
    description: "Walk-in and referred check-ins by day. Same eligible visits as Patient Visits.",
    periodLabel: period.label,
    data: sourceTrend,
    xKey: "label",
    series: [
      { key: "walkIn", label: "Walk-in", color: CHART_COLORS.brand },
      { key: "referred", label: "Referred", color: CHART_COLORS.ink },
    ],
    config: {
      walkIn: { label: "Walk-in", color: CHART_COLORS.brand },
      referred: { label: "Referred", color: CHART_COLORS.ink },
    },
  };

  const visitDistribution = donutChart(
    "Visit Distribution",
    "Walk-in versus referred among eligible visits in this period.",
    period,
    distributionSlices.length ? distributionSlices : [{ label: "No visits", value: 0 }],
    "Visits",
  );

  const clinicalPrograms = {
    kind: "horizontal-bar",
    title: "Clinical Program Activity",
    description:
      "Each bar is its own unit (doses, consultations, services, enrollments). Bars are not a shared percentage total.",
    periodLabel: period.label,
    data: programBars,
    xKey: "label",
    valueKey: "value",
    config: {
      value: { label: "Count", color: CHART_COLORS.ink },
    },
  };

  const cards = [
    card("total_visits", "Patient Visits", visitMetrics.total, "Eligible queue check-ins; mistakes excluded"),
    card(
      "completed_consultations",
      "Completed Consultations",
      visitMetrics.completedConsultations,
      "Visits closed with consultation completed",
    ),
    card("total_referrals", "Total Referrals", referralMetrics.total, "Incoming referrals submitted in period"),
    card(
      "recorded_diagnoses",
      "Recorded Diagnoses",
      recordedDiagnoses,
      "Reportable morbidity + notifiable diagnosis entries",
    ),
  ];

  const summary = [
    ...cards.map((item) => ({ label: item.label, value: item.value, note: item.hint })),
    {
      label: "Walk-in visits",
      value: visitMetrics.walkIn,
      note: "Eligible visits without a linked referral",
    },
    {
      label: "Referred visits",
      value: visitMetrics.referred,
      note: "Referral source or linked referral id",
    },
    ...programBars.map((row) => ({
      label: row.label,
      value: row.value,
      note: `Recorded ${row.unit} in period`,
    })),
  ];

  const view = reportView({
    category: selected,
    period,
    ageGroup,
    notes: [
      "Visits, referrals, consultations, diagnoses, and program activities are separate counts and are not added together.",
      "Clinical program bars compare magnitude only; each program keeps its own unit.",
    ],
    cards,
    charts: [visitTrend, visitDistribution, clinicalPrograms],
    summary,
  });

  return {
    ...view,
    bento: {
      visitTrend,
      visitDistribution,
      clinicalPrograms,
    },
  };
}
