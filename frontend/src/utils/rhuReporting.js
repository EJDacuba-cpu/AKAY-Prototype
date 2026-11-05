import { buildBhcReport, isDateInReportPeriod, trendSeries } from "./bhcReporting.js";

const CHART_COLORS = {
  brand: "var(--color-brand-600)",
  ink: "var(--color-ink-700)",
  info: "var(--color-info-500)",
};

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

function getReferralSourceLabel(referral = {}) {
  return (
    referral.originating_facility ||
    referral.barangay_health_center ||
    referral.from_facility ||
    referral.barangay ||
    ""
  );
}

function referralsBySource(cohort) {
  const buckets = new Map();
  for (const referral of cohort) {
    const rawLabel = String(getReferralSourceLabel(referral) || "").trim();
    const label = rawLabel || "Unspecified";
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
      .map((referral) => String(getReferralSourceLabel(referral) || "").trim())
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
  const summary = [
    {
      label: "Total Visits",
      value: visitMetrics.total,
      note: "Queue check-ins in period; mistakes excluded",
    },
    {
      label: "Referrals Submitted",
      value: referralMetrics.total,
      note: "Incoming referrals submitted in period",
    },
    {
      label: "Completed Consultations",
      value: visitMetrics.completedConsultations,
      note: "Visits closed with consultation completed",
    },
  ];

  return reportView({
    category: selected,
    period,
    ageGroup,
    notes: ["Visits, referrals, and consultations are separate counts and are not added together."],
    cards: [
      card("total_visits", "Total Visits", visitMetrics.total, summary[0].note),
      card("referrals_submitted", "Referrals Submitted", referralMetrics.total, summary[1].note),
      card(
        "completed_consultations",
        "Completed Consultations",
        visitMetrics.completedConsultations,
        summary[2].note,
      ),
      card("referring_bhcs", "Referring BHCs", referralMetrics.referringBhcs, "Distinct source facilities"),
    ],
    charts: [visitMetrics.charts[0], visitMetrics.charts[1], referralMetrics.charts[0]].filter(Boolean),
    summary,
  });
}
