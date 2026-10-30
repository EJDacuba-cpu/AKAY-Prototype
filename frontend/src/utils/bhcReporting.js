/**
 * Counts-first BHC reporting. Totals stay in their own units: doses, enrollments,
 * consultations, diagnoses, surveillance rows, and referrals are never added
 * together. RHU-confirmed outcomes stay apart from BHC morbidity counts.
 */
import { getReportedDiagnoses } from "./diagnosisReporting.js";
import { normalizeDateValue } from "./filterUtils.js";
import {
  EPI_VACCINE_ROWS,
  getEpiVaccineEntries,
  getRecordDateValue,
  isEpiRecord,
  isFamilyPlanningRecord,
  isMaternalRecord,
  normalizeVaccineName,
} from "./healthRecordPrograms.js";
import { getPrenatalEnrollment, isActivePrenatalEnrollment } from "./prenatalEnrollment.js";
import { getSurveillanceReportEntries } from "./surveillance.js";

export const REPORT_CATEGORIES = Object.freeze([
  Object.freeze({ key: "all", slug: "all", label: "All Categories" }),
  Object.freeze({ key: "epi", slug: "epi", label: "EPI / Immunization" }),
  Object.freeze({ key: "maternal", slug: "maternal", label: "Maternal Care" }),
  Object.freeze({ key: "family_planning", slug: "family-planning", label: "Family Planning" }),
  Object.freeze({ key: "morbidity", slug: "morbidity", label: "Morbidity" }),
  Object.freeze({ key: "notifiable", slug: "notifiable", label: "Notifiable Diseases" }),
  Object.freeze({ key: "surveillance", slug: "surveillance", label: "Community Surveillance" }),
  Object.freeze({ key: "referrals", slug: "referrals", label: "Referrals" }),
]);

export const PERIOD_PRESETS = Object.freeze([
  Object.freeze({ value: "weekly", label: "Weekly" }),
  Object.freeze({ value: "monthly", label: "Monthly" }),
  Object.freeze({ value: "custom", label: "Custom" }),
]);

const DEFAULT_CATEGORY = "all";
const NON_DOSE_VACCINES = new Set(["NEWBORN SCREENING", "CPAB"]);
const CHART_COLORS = {
  brand: "var(--color-brand-600)",
  ink: "var(--color-ink-700)",
  info: "var(--color-info-500)",
  success: "var(--color-success-500)",
  warning: "var(--color-warning-500)",
  muted: "var(--color-neutral-400)",
  soft: "var(--color-brand-300)",
};

const CATEGORY_ALIASES = Object.freeze({
  all: "all",
  "all-categories": "all",
  epi: "epi",
  immunization: "epi",
  "epi-target-client-list": "epi",
  "child-health": "epi",
  maternal: "maternal",
  "maternal-prenatal": "maternal",
  "family-planning": "family_planning",
  family_planning: "family_planning",
  morbidity: "morbidity",
  notifiable: "notifiable",
  "notifiable-diseases": "notifiable",
  "notifiable-disease": "notifiable",
  surveillance: "surveillance",
  "community-surveillance": "surveillance",
  "community-based-surveillance": "surveillance",
  referrals: "referrals",
  followups: "all",
  "follow-ups": "all",
  tb: "all",
});

export function normalizeReportCategory(value) {
  const raw = String(value || DEFAULT_CATEGORY)
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  return CATEGORY_ALIASES[raw] || REPORT_CATEGORIES.find((item) => item.slug === raw)?.key || DEFAULT_CATEGORY;
}

export function resolveReportPeriod({ preset = "monthly", from = "", to = "", now = new Date() } = {}) {
  const today = normalizeDateValue(now);
  const todayDate = parseDay(today);
  const selected = preset === "weekly" || preset === "custom" ? preset : "monthly";

  if (selected === "custom") {
    const start = normalizeDateValue(from);
    const end = normalizeDateValue(to) || start;
    if (!start) {
      return emptyPeriod(selected, today);
    }
    const boundedEnd = end > today ? today : end;
    const boundedStart = start > boundedEnd ? boundedEnd : start;
    return {
      preset: selected,
      start: boundedStart,
      end: boundedEnd,
      label: formatRangeLabel(boundedStart, boundedEnd),
    };
  }

  if (selected === "weekly") {
    const weekStart = new Date(todayDate);
    weekStart.setDate(todayDate.getDate() - todayDate.getDay());
    const start = normalizeDateValue(weekStart);
    return {
      preset: selected,
      start,
      end: today,
      label: formatRangeLabel(start, today),
    };
  }

  const monthStart = `${today.slice(0, 7)}-01`;
  return {
    preset: selected,
    start: monthStart,
    end: today,
    label: formatMonthLabel(todayDate),
  };
}

export function isDateInReportPeriod(value, period) {
  const date = normalizeDateValue(value);
  if (!date || !period?.start || !period?.end) return false;
  return date >= period.start && date <= period.end;
}

export function buildBhcReport({
  patients = [],
  records = [],
  referrals = [],
  category = "all",
  period,
} = {}) {
  const selected = normalizeReportCategory(category);
  const epi = buildEpiMetrics(records, period);
  const maternal = buildMaternalMetrics(patients, records, period);
  const familyPlanning = buildFamilyPlanningMetrics(records, period);
  const morbidity = buildDiagnosisMetrics(records, period, "morbidity");
  const notifiable = buildDiagnosisMetrics(records, period, "notifiable");
  const surveillance = buildSurveillanceMetrics(records, period);
  const referralMetrics = buildReferralMetrics(referrals, period);
  const metrics = { epi, maternal, familyPlanning, morbidity, notifiable, surveillance, referrals: referralMetrics };
  const view = views[selected](metrics, period);

  return {
    category: selected,
    categoryLabel: REPORT_CATEGORIES.find((item) => item.key === selected)?.label || "All Categories",
    period,
    cards: view.cards,
    charts: view.charts,
    summary: view.summary,
    empty: view.cards.every((card) => !Number(card.value)),
    printRows: view.summary,
  };
}

const views = {
  all: (metrics, period) => {
    const cards = [
      card("epi-doses", "EPI doses", metrics.epi.doses, "Doses administered"),
      card("maternal-active", "Active maternal enrollments", metrics.maternal.activeEnrollments, "At period end"),
      card("fp-services", "FP services", metrics.familyPlanning.services, "Recorded FP visits"),
      card("morbidity", "Morbidity diagnoses", metrics.morbidity.count, "Eligible reported diagnoses"),
      card("notifiable", "Notifiable diagnoses", metrics.notifiable.count, "Flagged notifiable diagnoses"),
      card("surveillance", "Surveillance entries", metrics.surveillance.count, "Recorded surveillance activity"),
      card("referrals", "Referrals sent", metrics.referrals.total, "BHC referrals in period"),
    ];
    return {
      cards,
      charts: [
        barChart("Category activity", "Each bar is its own count. These are not a shared total.", period, metricsToActivityBars(metrics), "label", "value", "count"),
        donutChart("Referral status", "Status of referrals sent in this period.", period, metrics.referrals.statusSlices, "Referral status"),
      ],
      summary: [
        ...cards.map((item) => ({ label: item.label, value: item.value, note: item.hint })),
        { label: "RHU-confirmed outcomes", value: metrics.referrals.confirmedOutcomes, note: "Linked RHU feedback; not BHC morbidity" },
      ],
    };
  },
  epi: (metrics, period) => {
    const { doses, vaccines, trend } = metrics.epi;
    return {
      cards: [
        card("doses", "Doses administered", doses, "Dated vaccine doses"),
        card("vaccines", "Vaccines recorded", vaccines.length, "Distinct vaccine names"),
        card("top", "Most given", vaccines[0]?.value || 0, vaccines[0]?.label || "No doses in period"),
      ],
      charts: [
        areaChart("Doses over the period", "Administered doses by day.", period, trend, "label", "value", "Doses"),
        barChart("Vaccine breakdown", "Doses by vaccine, not unique children.", period, vaccines, "label", "value", "Doses"),
      ],
      summary: [
        { label: "Doses administered", value: doses, note: "Excludes CPAB and newborn screening" },
        ...vaccines.map((item) => ({ label: item.label, value: item.value, note: "Doses" })),
      ],
    };
  },
  maternal: (metrics, period) => {
    const { activeEnrollments, newEnrollments, consultations, trend } = metrics.maternal;
    return {
      cards: [
        card("active", "Active enrollments", activeEnrollments, "Prenatal or postpartum at period end"),
        card("new", "New enrollments", newEnrollments, "First maternal record in period"),
        card("consults", "Prenatal consultations", consultations, "Maternal visits in period"),
      ],
      charts: [
        areaChart("Consultations over the period", "Maternal / prenatal visits by day.", period, trend, "label", "value", "Consultations"),
        barChart("Enrollment activity", "Active at period end is not the same as new enrollments.", period, [
          { label: "Active at period end", value: activeEnrollments },
          { label: "New enrollments", value: newEnrollments },
          { label: "Consultations", value: consultations },
        ], "label", "value", "Count"),
      ],
      summary: [
        { label: "Active enrollments", value: activeEnrollments, note: "Status at period end" },
        { label: "New enrollments", value: newEnrollments, note: "First maternal record fell in period" },
        { label: "Prenatal consultations", value: consultations, note: "Visits in period" },
      ],
    };
  },
  family_planning: (metrics, period) => {
    const { services, newAcceptors, methods, trend } = metrics.familyPlanning;
    return {
      cards: [
        card("new", "New acceptors", newAcceptors, "NA / new acceptor client type"),
        card("services", "FP services", services, "Recorded FP visits"),
        card("methods", "Methods recorded", methods.length, "Distinct method groups"),
      ],
      charts: [
        areaChart("FP services over the period", "Family planning visits by day.", period, trend, "label", "value", "Services"),
        donutChart("Method distribution", "Recorded methods among FP visits in this period.", period, methods, "FP methods"),
      ],
      summary: [
        { label: "New acceptors", value: newAcceptors, note: "Client type" },
        { label: "FP services", value: services, note: "Visits" },
        ...methods.map((item) => ({ label: item.label, value: item.value, note: "Method" })),
      ],
    };
  },
  morbidity: (metrics, period) => diagnosisView("Morbidity", "Eligible reported diagnoses, not confirmed RHU cases.", metrics.morbidity, period),
  notifiable: (metrics, period) => diagnosisView("Notifiable", "Flagged notifiable diagnoses. A suspected case is not a confirmed notification.", metrics.notifiable, period),
  surveillance: (metrics, period) => {
    const { count, areas, diseases, trend } = metrics.surveillance;
    return {
      cards: [
        card("entries", "Surveillance entries", count, "Recorded surveillance activity"),
        card("areas", "Affected areas", areas.length, "Distinct area / sitio values"),
        card("diseases", "Diagnoses", diseases.length, "Distinct diagnoses"),
      ],
      charts: [
        areaChart("Surveillance activity", "Surveillance entries by day.", period, trend, "label", "value", "Entries"),
        barChart("Diagnoses", "Entries by diagnosis.", period, diseases, "label", "value", "Entries"),
      ],
      summary: [
        { label: "Surveillance entries", value: count, note: "Activity in period" },
        { label: "Affected areas", value: areas.length, note: areas.map((item) => item.label).join(", ") || "None recorded" },
        ...diseases.map((item) => ({ label: item.label, value: item.value, note: "Diagnosis" })),
      ],
    };
  },
  referrals: (metrics, period) => {
    const { total, pending, received, completed, noShow, confirmedOutcomes, confirmedNames, trend, statusSlices } = metrics.referrals;
    return {
      cards: [
        card("sent", "Referrals sent", total, "BHC referrals in period"),
        card("pending", "Pending", pending, "Awaiting RHU receipt"),
        card("received", "Received", received, "Received at RHU"),
        card("completed", "Completed", completed, "Closed referrals"),
        card("noshow", "No-show", noShow, "Did not attend"),
        card("confirmed", "RHU-confirmed outcomes", confirmedOutcomes, "Linked RHU findings; not BHC morbidity"),
      ],
      charts: [
        areaChart("Referrals sent", "Referrals by day of referral.", period, trend, "label", "value", "Referrals"),
        donutChart("Referral status", "Status mix for referrals sent in this period.", period, statusSlices, "Status"),
      ],
      summary: [
        { label: "Referrals sent", value: total, note: "Referral date in period" },
        { label: "Pending", value: pending, note: "Status" },
        { label: "Received", value: received, note: "Status" },
        { label: "Completed", value: completed, note: "Status" },
        { label: "No-show", value: noShow, note: "Status" },
        { label: "RHU-confirmed outcomes", value: confirmedOutcomes, note: confirmedNames.slice(0, 8).join(", ") || "No linked RHU findings" },
      ],
    };
  },
};

function diagnosisView(title, description, metrics, period) {
  return {
    cards: [
      card("count", `${title} diagnoses`, metrics.count, description),
      card("diseases", "Distinct diseases", metrics.diseases.length, "By diagnosis name"),
      card("top", "Most reported", metrics.diseases[0]?.value || 0, metrics.diseases[0]?.label || "No diagnoses in period"),
    ],
    charts: [
      areaChart(`${title} over the period`, "Reported diagnoses by day.", period, metrics.trend, "label", "value", "Diagnoses"),
      barChart("By disease", "Counts of reported diagnoses, not unique patients.", period, metrics.diseases, "label", "value", "Diagnoses"),
    ],
    summary: [
      { label: `${title} diagnoses`, value: metrics.count, note: description },
      ...metrics.diseases.map((item) => ({ label: item.label, value: item.value, note: "Diagnoses" })),
    ],
  };
}

function buildEpiMetrics(records, period) {
  const doses = [];
  for (const record of records.filter(isEpiRecord)) {
    for (const entry of getEpiVaccineEntries(record)) {
      const vaccine = normalizeVaccineName(entry.vaccineName);
      if (!vaccine || NON_DOSE_VACCINES.has(vaccine)) continue;
      const date = normalizeDateValue(entry.dateGiven);
      if (!isDateInReportPeriod(date, period)) continue;
      doses.push({ date, vaccine: displayVaccineName(vaccine, entry.vaccineName) });
    }
  }
  return {
    doses: doses.length,
    vaccines: countBy(doses, (item) => item.vaccine),
    trend: trendSeries(doses.map((item) => item.date), period),
  };
}

function buildMaternalMetrics(patients, records, period) {
  const maternalRecords = records.filter(isMaternalRecord);
  const consultations = maternalRecords.filter((record) => isDateInReportPeriod(getRecordDateValue(record), period));
  const patientMap = mapByPatient(patients);
  const recordsByPatient = groupByPatient(maternalRecords);
  let activeEnrollments = 0;
  let newEnrollments = 0;
  const periodEnd = parseDay(period.end);

  for (const [patientId, patientRecords] of recordsByPatient) {
    const historical = patientRecords.filter((record) => {
      const date = normalizeDateValue(getRecordDateValue(record));
      return date && date <= period.end;
    });
    if (!historical.length) continue;
    const patient = patientMap.get(patientId) || { id: patientId };
    if (isActivePrenatalEnrollment(getPrenatalEnrollment(patient, historical, periodEnd).status)) {
      activeEnrollments += 1;
    }
    const firstDate = earliestDate(patientRecords.map((record) => getRecordDateValue(record)));
    if (isDateInReportPeriod(firstDate, period)) newEnrollments += 1;
  }

  return {
    activeEnrollments,
    newEnrollments,
    consultations: consultations.length,
    trend: trendSeries(consultations.map((record) => getRecordDateValue(record)), period),
  };
}

function buildFamilyPlanningMetrics(records, period) {
  const visits = records
    .filter(isFamilyPlanningRecord)
    .filter((record) => isDateInReportPeriod(getRecordDateValue(record), period))
    .map((record) => record.familyPlanningData || record.family_planning_data || {});
  const methods = visits
    .map((data) => fpMethodLabel(data.methodUsed || data.method_used))
    .filter(Boolean);
  return {
    services: visits.length,
    newAcceptors: visits.filter((data) => isNewAcceptor(data.clientType || data.client_type)).length,
    methods: countBy(methods.map((label) => ({ label })), (item) => item.label),
    trend: trendSeries(
      records.filter(isFamilyPlanningRecord).map((record) => getRecordDateValue(record)).filter((date) => isDateInReportPeriod(date, period)),
      period,
    ),
  };
}

function buildDiagnosisMetrics(records, period, reportType) {
  const entries = records.flatMap((record) => {
    const date = normalizeDateValue(getRecordDateValue(record));
    if (!isDateInReportPeriod(date, period)) return [];
    return getReportedDiagnoses(record, reportType).map((name) => ({ date, name: name || "Unspecified" }));
  });
  return {
    count: entries.length,
    diseases: countBy(entries, (item) => item.name),
    trend: trendSeries(entries.map((item) => item.date), period),
  };
}

function buildSurveillanceMetrics(records, period) {
  const eligible = records.filter((record) => isDateInReportPeriod(getRecordDateValue(record), period));
  const entries = getSurveillanceReportEntries(eligible).map(({ record, diagnosis }) => ({
    date: normalizeDateValue(getRecordDateValue(record)),
    diagnosis,
    area: areaSitio(record),
  }));
  return {
    count: entries.length,
    areas: countBy(entries.filter((item) => item.area), (item) => item.area),
    diseases: countBy(entries, (item) => item.diagnosis || "Unspecified"),
    trend: trendSeries(entries.map((item) => item.date), period),
  };
}

function buildReferralMetrics(referrals, period) {
  const sent = referrals.filter((referral) => isDateInReportPeriod(getReferralDate(referral), period));
  const pending = sent.filter((referral) => statusOf(referral) === "Pending").length;
  const received = sent.filter((referral) => statusOf(referral) === "Received").length;
  const completed = sent.filter((referral) => statusOf(referral) === "Completed").length;
  const noShow = sent.filter((referral) => statusOf(referral) === "No-Show").length;
  const confirmed = [];
  for (const referral of referrals) {
    const names = rhuConfirmedNames(referral);
    if (!names.length) continue;
    const date = normalizeDateValue(getConfirmationDate(referral) || getReferralDate(referral));
    if (!isDateInReportPeriod(date, period)) continue;
    names.forEach((name) => confirmed.push(name));
  }
  return {
    total: sent.length,
    pending,
    received,
    completed,
    noShow,
    confirmedOutcomes: confirmed.length,
    confirmedNames: unique(confirmed),
    trend: trendSeries(sent.map((referral) => getReferralDate(referral)), period),
    statusSlices: [
      { label: "Pending", value: pending },
      { label: "Received", value: received },
      { label: "Completed", value: completed },
      { label: "No-show", value: noShow },
    ].filter((item) => item.value > 0),
  };
}

function metricsToActivityBars(metrics) {
  return [
    { label: "EPI doses", value: metrics.epi.doses },
    { label: "Maternal consultations", value: metrics.maternal.consultations },
    { label: "FP services", value: metrics.familyPlanning.services },
    { label: "Morbidity diagnoses", value: metrics.morbidity.count },
    { label: "Notifiable diagnoses", value: metrics.notifiable.count },
    { label: "Surveillance entries", value: metrics.surveillance.count },
    { label: "Referrals sent", value: metrics.referrals.total },
  ];
}

function card(key, label, value, hint) {
  return { key, label, value: Number(value) || 0, hint };
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

function barChart(title, description, period, data, xKey, valueKey, seriesLabel) {
  return {
    kind: "bar",
    title,
    description,
    periodLabel: period.label,
    data,
    xKey,
    valueKey,
    seriesLabel,
    config: { [valueKey]: { label: seriesLabel, color: CHART_COLORS.ink } },
  };
}

function donutChart(title, description, period, data, seriesLabel) {
  const colored = data.map((item, index) => {
    const key = slugKey(item.label);
    return {
      ...item,
      key,
      fill: [CHART_COLORS.brand, CHART_COLORS.ink, CHART_COLORS.info, CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.soft, CHART_COLORS.muted][index % 7],
    };
  });
  const config = Object.fromEntries(
    colored.map((item) => [item.key, { label: item.label, color: item.fill }]),
  );
  return {
    kind: "donut",
    title,
    description,
    periodLabel: period.label,
    data: colored,
    xKey: "label",
    valueKey: "value",
    seriesLabel,
    config,
  };
}

export function trendSeries(dates, period) {
  const buckets = new Map();
  for (const day of eachDay(period.start, period.end)) {
    buckets.set(day, 0);
  }
  for (const value of dates) {
    const date = normalizeDateValue(value);
    if (!buckets.has(date)) continue;
    buckets.set(date, buckets.get(date) + 1);
  }
  return [...buckets.entries()].map(([date, value]) => ({
    date,
    label: formatDayTick(date, period),
    value,
  }));
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function mapByPatient(patients) {
  return new Map(
    (Array.isArray(patients) ? patients : []).map((patient) => [
      String(patient.id || patient.patientId || ""),
      patient,
    ]),
  );
}

function groupByPatient(records) {
  const groups = new Map();
  for (const record of records) {
    const patientId = String(record.patientId || record.patient_id || record.patient?.id || "");
    if (!patientId) continue;
    if (!groups.has(patientId)) groups.set(patientId, []);
    groups.get(patientId).push(record);
  }
  return groups;
}

function earliestDate(values) {
  return values.map(normalizeDateValue).filter(Boolean).sort()[0] || "";
}

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

function getConfirmationDate(referral = {}) {
  const feedback = referral.feedback || {};
  return (
    feedback.created_at ||
    feedback.createdAt ||
    feedback.submittedAt ||
    feedback.submitted_at ||
    feedback.received_at ||
    feedback.receivedAt ||
    ""
  );
}

function statusOf(referral = {}) {
  const raw = String(referral.status || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  if (raw === "pending") return "Pending";
  if (raw === "received" || raw === "for monitoring") return "Received";
  if (raw === "completed" || raw === "complete" || raw === "done") return "Completed";
  if (raw === "no show") return "No-Show";
  return referral.status || "Pending";
}

function rhuConfirmedNames(referral = {}) {
  const feedback = referral.feedback || {};
  const confirmations = [
    ...(Array.isArray(feedback.conditionConfirmations) ? feedback.conditionConfirmations : []),
    ...(Array.isArray(feedback.condition_confirmations) ? feedback.condition_confirmations : []),
    ...(Array.isArray(referral.conditionConfirmations) ? referral.conditionConfirmations : []),
  ];
  const names = confirmations
    .map((item) => String(item?.conditionName || item?.condition_name || item?.name || "").trim())
    .filter(Boolean);
  const diagnosis = String(feedback.rhuDiagnosis || feedback.rhu_diagnosis || "").trim();
  if (diagnosis && diagnosis !== "RHU feedback submitted") names.push(diagnosis);
  return names;
}

function isNewAcceptor(clientType) {
  const value = String(clientType || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  return value === "na" || value.startsWith("na ") || value.includes("new acceptor");
}

function fpMethodLabel(method) {
  const raw = String(method || "").trim();
  if (!raw) return "";
  const value = raw.toLowerCase();
  if (/pill|coc|pop/.test(value)) return "Pills";
  if (/dmpa|\bcic\b|inject/.test(value)) return "Injectable";
  if (/implant|\bimp\b/.test(value)) return "Implant";
  if (/\biud\b/.test(value)) return "IUD";
  if (/condom|\bcon\b/.test(value)) return "Condom";
  if (/\bnsv\b|vasectomy|male steril/.test(value)) return "NSV";
  if (/\bbtl\b|tubal|female steril|fstr/.test(value)) return "BTL";
  if (/\blam\b|lactational/.test(value)) return "LAM";
  if (/nfp|basal body|cervical mucus|symptothermal|standard days/.test(value)) return "Natural FP";
  return raw.includes("—") ? raw.split("—").slice(1).join("—").trim() || raw : raw;
}

function areaSitio(record = {}) {
  const patient = record.patient && typeof record.patient === "object" ? record.patient : {};
  return firstFilled(
    patient.purokArea,
    patient.purok_area,
    patient.purok,
    patient.sitio,
    patient.area,
    record.purokArea,
    record.purok_area,
    record.purok,
    record.sitio,
    record.area,
    patient.barangay,
    record.barangay,
  );
}

function displayVaccineName(normalized, original) {
  const listed = EPI_VACCINE_ROWS.find((name) => name.toUpperCase() === normalized);
  return listed || String(original || normalized).trim();
}

function firstFilled(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function slugKey(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

function parseDay(value) {
  const date = normalizeDateValue(value);
  return date ? new Date(`${date}T12:00:00`) : new Date();
}

function eachDay(start, end) {
  const days = [];
  const cursor = parseDay(start);
  const last = parseDay(end);
  while (cursor <= last) {
    days.push(normalizeDateValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function formatRangeLabel(start, end) {
  const from = parseDay(start);
  const to = parseDay(end);
  const sameYear = from.getFullYear() === to.getFullYear();
  const startLabel = from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
  const endLabel = to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

function formatMonthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDayTick(date, period) {
  const day = parseDay(date);
  const span = eachDay(period.start, period.end).length;
  if (span > 45) {
    return day.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return String(day.getDate());
}

function emptyPeriod(preset, today) {
  return { preset, start: today, end: today, label: formatRangeLabel(today, today) };
}
