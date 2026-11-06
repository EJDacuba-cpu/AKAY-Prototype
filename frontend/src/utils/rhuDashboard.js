import { getFacilityCalendarDate, toFacilityCalendarDate } from "./medicineInventoryStatus.js";
import { getEffectiveFollowUpState } from "./patientProfile.js";
import { formatPatientName } from "./formatters.js";
import { ACTIVITY_PERIODS, formatKpiValue, isLockedMetric, sliceActivitySeries } from "./bhcDashboard.js";

export { ACTIVITY_PERIODS, formatKpiValue, isLockedMetric, sliceActivitySeries };

const CLOSE_REASON_MISTAKE = "checked_in_by_mistake";
const CLOSE_REASON_CONSULTATION_COMPLETED = "consultation_completed";
const RECENT_ACTIVITY_LIMIT = 6;
const MASKED_IDENTITY_LABEL = "Identity unavailable";

export function manilaToday(now = new Date()) {
  return getFacilityCalendarDate(now);
}

export function visitCheckInDate(visit) {
  return toFacilityCalendarDate(visit?.checked_in_at) || "";
}

/** Completion day for finalized consultations — prefers closed_at (Manila). */
export function visitCompletionDate(visit) {
  return toFacilityCalendarDate(visit?.closed_at) || visitCheckInDate(visit) || "";
}

export function isEligibleVisit(visit) {
  return Boolean(visit) && visit?.close_reason !== CLOSE_REASON_MISTAKE;
}

/** Deduplicate visit payloads (active + include_closed) by id. */
export function mergeVisitRecords(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const visit of Array.isArray(list) ? list : []) {
      if (visit == null || visit.id == null || visit.id === "") continue;
      byId.set(String(visit.id), visit);
    }
  }
  return [...byId.values()];
}

export function countActiveQueue(visits) {
  if (!Array.isArray(visits)) return 0;
  return visits.filter((visit) => {
    if (!isEligibleVisit(visit)) return false;
    const status = String(visit?.status || "").trim();
    if (status === "waiting" || status === "in_consultation") return true;
    return !visit?.closed_at && !visit?.close_reason;
  }).length;
}

export function countPendingReferrals(referrals) {
  if (!Array.isArray(referrals)) return 0;
  return referrals.filter((referral) => {
    const status = String(referral?.status || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ");
    return status === "pending";
  }).length;
}

export function countConsultationsToday(visits, today = manilaToday()) {
  if (!Array.isArray(visits)) return 0;
  return visits.filter((visit) => {
    if (!isEligibleVisit(visit)) return false;
    if (visit?.close_reason !== CLOSE_REASON_CONSULTATION_COMPLETED) return false;
    return visitCompletionDate(visit) === today;
  }).length;
}

export function countFollowUpsDueToday(tasks, today = manilaToday()) {
  if (!Array.isArray(tasks)) return 0;
  return tasks.filter((task) => getEffectiveFollowUpState(task, today) === "due_today").length;
}

export function countOverdueFollowUps(tasks, today = manilaToday()) {
  if (!Array.isArray(tasks)) return 0;
  return tasks.filter((task) => {
    const state = String(task?.state || "").toLowerCase();
    if (state === "fulfilled" || state === "cancelled" || state === "canceled") return false;
    return getEffectiveFollowUpState(task, today) === "no_show";
  }).length;
}

export function countQueueAwaitingAction(visits) {
  if (!Array.isArray(visits)) return 0;
  return visits.filter((visit) => {
    if (!isEligibleVisit(visit)) return false;
    const status = String(visit?.status || "").trim();
    return status === "waiting" || status === "in_consultation";
  }).length;
}

export function buildVisitActivitySeries(visits, { days = 30, today = manilaToday() } = {}) {
  const size = Number(days) === 7 ? 7 : 30;
  const end = parseIsoDay(today);
  if (!end) return [];

  const buckets = new Map();
  for (let offset = size - 1; offset >= 0; offset -= 1) {
    const day = shiftIsoDay(end, -offset);
    buckets.set(day, 0);
  }

  for (const visit of Array.isArray(visits) ? visits : []) {
    if (!isEligibleVisit(visit)) continue;
    const day = visitCheckInDate(visit);
    if (!day || !buckets.has(day)) continue;
    buckets.set(day, buckets.get(day) + 1);
  }

  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

export function resolveVisitPatientIdentity(visit) {
  const patient = visit?.patient && typeof visit.patient === "object" ? visit.patient : null;
  const patientId = patient?.id ?? visit?.patient_id ?? visit?.patientId ?? "";
  const authorizedName = formatPatientName(patient || visit, "").trim();

  if (authorizedName) {
    return {
      patientId: patientId ? String(patientId) : "",
      patientName: authorizedName,
      identityMasked: false,
    };
  }

  return {
    patientId: patientId ? String(patientId) : "",
    patientName: MASKED_IDENTITY_LABEL,
    identityMasked: true,
  };
}

export function buildRecentVisitActivity(visits, { limit = RECENT_ACTIVITY_LIMIT } = {}) {
  const rows = (Array.isArray(visits) ? visits : [])
    .filter(isEligibleVisit)
    .map((visit) => {
      const checkedInAt = visit?.checked_in_at || "";
      const { patientId, patientName, identityMasked } = resolveVisitPatientIdentity(visit);
      const source =
        String(visit?.source || "").toLowerCase() === "referral" ||
        visit?.referral_id != null ||
        visit?.referral?.id != null
          ? "Referred"
          : "Walk-in";
      return {
        id: String(visit?.id || `${patientId || patientName}-${checkedInAt}`),
        patientName,
        identityMasked,
        source,
        status: formatVisitStatus(visit),
        checkedInAt,
        href: patientId && !identityMasked ? `/rhu/patients/${patientId}` : "/rhu/patients?view=queue",
      };
    })
    .sort((a, b) => String(b.checkedInAt).localeCompare(String(a.checkedInAt)));

  return rows.slice(0, Math.max(0, Number(limit) || RECENT_ACTIVITY_LIMIT));
}

export function buildMedicineAlertItems(medicines, { limit = 3 } = {}) {
  return (Array.isArray(medicines) ? medicines : [])
    .filter((item) =>
      ["Low Stock", "Unavailable", "Expired", "Out of Stock"].includes(
        item?.availabilityStatus || item?.status,
      ),
    )
    .slice(0, Math.max(0, Number(limit) || 3));
}

export function buildRhuKpis({
  activeVisits,
  allVisits,
  referrals,
  followUpTasks,
  access = {},
  today = manilaToday(),
} = {}) {
  return {
    todays_queue: access.queue === false ? null : countActiveQueue(activeVisits),
    pending_referrals: access.referrals === false ? null : countPendingReferrals(referrals),
    consultations_today: access.queue === false ? null : countConsultationsToday(allVisits, today),
    follow_ups_due_today:
      access.followups === false ? null : countFollowUpsDueToday(followUpTasks, today),
  };
}

export function buildRhuAttentionItems({
  pendingReferrals = 0,
  queueAwaitingAction = 0,
  followUpsDueToday = 0,
  overdueFollowUps = 0,
  medicineAlerts = [],
  access = {},
} = {}) {
  const items = [];

  if (access.referrals !== false) {
    pushCountItem(items, {
      key: "pending-referrals",
      label: "Pending referral arrivals",
      count: pendingReferrals,
      href: "/rhu/incoming-referrals",
    });
  }

  if (access.queue !== false) {
    pushCountItem(items, {
      key: "queue-action",
      label: "Consultations awaiting action",
      count: queueAwaitingAction,
      href: "/rhu/patients?view=queue",
    });
  }

  if (access.followups !== false) {
    pushCountItem(items, {
      key: "follow-ups-due",
      label: "Follow-ups due today",
      count: followUpsDueToday,
      href: "/rhu/follow-ups",
    });
    pushCountItem(items, {
      key: "follow-ups-overdue",
      label: "Overdue follow-ups",
      count: overdueFollowUps,
      href: "/rhu/follow-ups",
    });
  }

  if (access.inventory !== false) {
    const alerts = Array.isArray(medicineAlerts) ? medicineAlerts : [];
    if (alerts.length > 0) {
      items.push({
        key: "medicine",
        label: "Medicine alerts",
        count: alerts.length,
        href: "/rhu/medicine-management",
        detail: alerts
          .map((item) => item?.name || item?.medicineName)
          .filter(Boolean)
          .slice(0, 3)
          .join(", "),
      });
    }
  }

  return items;
}

function pushCountItem(items, { key, label, count, href }) {
  if (count == null) return;
  const value = Number(count) || 0;
  if (value <= 0) return;
  items.push({ key, label, count: value, href });
}

function formatVisitStatus(visit) {
  const status = String(visit?.status || "").trim();
  if (status === "waiting") return "Waiting";
  if (status === "in_consultation") return "In consultation";
  if (visit?.close_reason === CLOSE_REASON_CONSULTATION_COMPLETED) return "Consultation completed";
  if (visit?.closed_at || visit?.close_reason) return "Closed";
  return status ? status.replace(/_/g, " ") : "Checked in";
}

function parseIsoDay(value) {
  const raw = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shiftIsoDay(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
