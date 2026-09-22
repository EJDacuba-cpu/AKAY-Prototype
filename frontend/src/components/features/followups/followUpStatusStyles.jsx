import { formatDisplayValue } from "../../../utils/formatters";
import { formatServiceType } from "../../../utils/healthRecordPrograms";

export const STATE_CONFIG = {
  due_today: {
    label: "Due Today",
    badge: "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    event: "border-l-[#F59E0B] bg-[#FFFBEB] text-[#B45309]",
    dot: "bg-[#F59E0B]",
  },
  upcoming: {
    label: "Pending",
    badge: "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
    event: "border-l-[#94A3B8] bg-[#F1F5F9] text-[#475569]",
    dot: "bg-[#94A3B8]",
  },
  no_show: {
    label: "No Show",
    badge: "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]",
    event: "border-l-[#EF4444] bg-[#FEF2F2] text-[#B91C1C]",
    dot: "bg-[#EF4444]",
  },
  rescheduled: {
    label: "Rescheduled",
    badge: "border-[#CBD5E1] bg-[#F1F5F9] text-[#334155]",
    event: "border-l-[#64748B] bg-[#F1F5F9] text-[#334155]",
    dot: "bg-[#64748B]",
  },
  fulfilled: {
    label: "Completed",
    badge: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    event: "border-l-[#10B981] bg-[#ECFDF5] text-[#047857]",
    dot: "bg-[#10B981]",
  },
  cancelled: {
    label: "Cancelled",
    badge: "border-[#CBD5E1] bg-[#F8FAFC] text-[#64748B]",
    event: "border-l-[#94A3B8] bg-[#F8FAFC] text-[#64748B]",
    dot: "bg-[#94A3B8]",
  },
  // Calendar-only: a task a reschedule has since superseded, shown on its
  // original due date (Part A.4.4 - "resolved", not "missed", since it was
  // acted on in time, just moved rather than fulfilled in place).
  superseded: {
    label: "Rescheduled",
    badge: "border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]",
    event: "border-l-[#CBD5E1] bg-[#F8FAFC] text-[#94A3B8] opacity-75",
    dot: "bg-[#CBD5E1]",
  },
};

const DEFAULT_STATE = "upcoming";

export function getStateConfig(state) {
  return STATE_CONFIG[state] || STATE_CONFIG[DEFAULT_STATE];
}

export function getEffectiveState(task) {
  if (task.state === "fulfilled") return "fulfilled";
  if (task.state === "no_show") return "no_show";
  if (task.state === "cancelled" || task.state === "canceled") return "cancelled";

  const dueDate = normalizeDate(task.dueDate);
  const today = normalizeDate(new Date());

  if (!dueDate) return "upcoming";
  if (dueDate === today) return "due_today";
  if (dueDate < today) return "no_show";
  if (task.state === "rescheduled") return "rescheduled";
  return "upcoming";
}

export function isTaskSuperseded(task) {
  return Boolean(task.rescheduledToId);
}

/**
 * Calendar-only variant of getEffectiveState. The List view never sees a
 * superseded row (the server excludes them), so getEffectiveState has no
 * concept of one - but the Calendar deliberately keeps them visible on
 * their original due date (Part A.4.4), and they must read as "resolved"
 * there rather than as an active, actionable Rescheduled card.
 */
export function getCalendarEffectiveState(task) {
  if (isTaskSuperseded(task)) return "superseded";
  return getEffectiveState(task);
}

/**
 * The one follow-up action menu, shared by the List rows and every Calendar
 * event so the two views can never offer different actions for the same
 * task. Optional handlers are only listed when the caller supplies them.
 */
export function buildTaskActions(task, handlers) {
  const actions = [];

  if (["due_today", "no_show", "upcoming", "rescheduled"].includes(task.effectiveState)) {
    actions.push({
      label: "Record Visit",
      onClick: handlers.onRecordVisit,
    });
    actions.push({
      label: "Reschedule",
      onClick: handlers.onReschedule,
    });
    if (handlers.onCancel) {
      actions.push({
        label: "Cancel Follow-up",
        onClick: handlers.onCancel,
      });
    }
  }

  if (task.effectiveState === "fulfilled" && handlers.onViewRecord) {
    actions.push({
      label: "View Health Record",
      onClick: handlers.onViewRecord,
    });
  }

  actions.push({
    label: "View Follow-up Details",
    to: `/bhc/follow-ups/${task.id}`,
  });
  return actions;
}

export function formatFollowUpId(task) {
  return task?.id ? `FU-${task.id}` : "—";
}

export function getTaskNavigationTarget(task) {
  return task.id ? `/bhc/follow-ups/${task.id}` : "";
}

/**
 * The query contract the consultation workspace reads when a visit is recorded
 * against an existing follow-up. Shared by every surface that offers
 * "Record Visit" (the Follow-ups list/calendar and the Patient Profile) so
 * the two cannot drift apart. The workspace opens directly for the exact task.
 */
export function buildRecordFollowUpVisitPath(task, basePath = "/bhc") {
  const params = new URLSearchParams({
    mode: "followup",
    followUpId: task.id,
    patientId: task.patientId,
    serviceType: getTaskClassification(task) || getTaskServiceTypeLabel(task),
    followUpStatus: formatStateLabel(task.effectiveState || getEffectiveState(task)),
    followUpDate: task.dueDate || "",
  });

  if (task.healthRecordId) params.set("recordId", task.healthRecordId);

  return `${basePath}/health-records/add?${params.toString()}`;
}

export function normalizeFilterState(value) {
  const map = {
    "Due Today": "due_today",
    Pending: "upcoming",
    "No Show": "no_show",
    Rescheduled: "rescheduled",
    Completed: "fulfilled",
    Cancelled: "cancelled",
  };

  return map[value] || "all_active";
}

export function formatStateLabel(state) {
  return getStateConfig(state).label;
}

export function normalizeDate(value) {
  if (!value) return "";
  // Local calendar date, not toISOString(): in UTC+8 a local midnight is
  // still the previous day in UTC, which put every calendar event one column
  // late and moved "today" to tomorrow.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }
  return String(value).slice(0, 10);
}

export function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(`${normalizeDate(value)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTimeLabel(value) {
  if (!value) return "";
  const [hourStr, minuteStr] = String(value).split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return "";

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

export function getTaskClassification(task) {
  return (
    task.healthRecord?.category ||
      task.healthRecord?.patientClassification ||
      task.healthRecord?.recordType ||
      task.healthRecord?.record_type ||
      task.healthRecord?.healthRecordType ||
      task.healthRecord?.health_record_type ||
      task.category ||
      task.patientClassification ||
      task.recordType ||
      ""
  );
}

export function getTaskServiceTypeLabel(task) {
  return formatServiceType(getTaskClassification(task), "Unclassified");
}

export function getPatientSubtext(task) {
  return formatDisplayValue(
    task.patient?.patientId ||
      task.patientId ||
      task.patient?.ageSex ||
      task.patient?.age ||
      "",
    "No patient ID",
  );
}

export function StateBadge({ state }) {
  const config = getStateConfig(state);

  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${config.badge}`}
    >
      {config.label}
    </span>
  );
}

const CLASSIFICATION_STYLES = {
  "General Consultation": "bg-slate-100 text-slate-700",
  "Maternal / Prenatal": "bg-pink-50 text-pink-700",
  "Child Health / EPI": "bg-emerald-50 text-emerald-700",
  "Hypertension / Diabetic Monitoring": "bg-blue-50 text-blue-700",
  "Family Planning": "bg-purple-50 text-purple-700",
  "TB DOTS / TB Monitoring": "bg-amber-50 text-amber-700",
};

export function ClassificationBadge({ classification }) {
  return (
    <span
      className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ${
        CLASSIFICATION_STYLES[classification] || "bg-slate-100 text-slate-700"
      }`}
    >
      {classification}
    </span>
  );
}
