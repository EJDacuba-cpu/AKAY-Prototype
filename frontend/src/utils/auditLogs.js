import { MANILA_TIMEZONE } from "./doctorAvailabilityCalendar.js";

export function formatAuditDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dateText = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE, month: "short", day: "numeric", year: "numeric",
  }).format(date);
  const timeText = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(date);
  return `${dateText} • ${timeText}`;
}

function title(value) {
  return String(value || "Unspecified").replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function auditRow(log) {
  const tier = { admin: "Admin", bhc: "BHC", rhu: "RHU" }[log.user?.role];
  return {
    id: `LOG-${String(log.id).padStart(3, "0")}`,
    rawAction: log.action,
    action: log.action_label || title(log.action),
    module: log.module_label || title(log.module),
    performedBy: log.actor_name || log.user?.name || "Not recorded",
    role: log.role_label || tier || "Not recorded",
    tier,
    details: log.summary || "Activity recorded.",
    dateTime: formatAuditDateTime(log.created_at),
    level: log.category || "Other",
  };
}
