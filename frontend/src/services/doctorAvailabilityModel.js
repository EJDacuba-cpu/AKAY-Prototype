export const AVAILABILITY_AVAILABLE = "Available";
export const AVAILABILITY_UNAVAILABLE = "Unavailable";

export const AVAILABILITY_STATUSES = [
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
];

export const AWAITING_RHU_UPDATE = "Awaiting RHU Update";

export const EMPTY_AVAILABILITY = {
  ruralHealthUnitId: null,
  availableCount: 0,
  totalCount: 0,
  status: AVAILABILITY_UNAVAILABLE,
  canSubmitReferral: false,
  updatedAt: "",
  providers: [],
};

export function normalizeAvailabilityStatus(status) {
  return status === AVAILABILITY_AVAILABLE
    ? AVAILABILITY_AVAILABLE
    : AVAILABILITY_UNAVAILABLE;
}

export function normalizeProvider(provider = {}) {
  const userId = provider.user_id ?? provider.userId ?? null;

  return {
    id: provider.id ? String(provider.id) : "",
    userId: userId === null || userId === undefined || userId === ""
      ? null
      : String(userId),
    name: provider.name || "",
    specialization: provider.specialization || "",
    availabilityStatus: normalizeAvailabilityStatus(
      provider.availability_status ?? provider.availabilityStatus,
    ),
    effectiveAvailabilityStatus: normalizeAvailabilityStatus(
      provider.effective_availability_status
        ?? provider.effectiveAvailabilityStatus
        ?? provider.availability_status
        ?? provider.availabilityStatus,
    ),
    remarks: provider.remarks || "",
    internalNotes: provider.internal_notes ?? provider.internalNotes ?? "",
    expectedAvailableAt:
      provider.expected_available_at || provider.expectedAvailableAt || "",
    awaitingRhuUpdate: Boolean(
      provider.awaiting_rhu_update ?? provider.awaitingRhuUpdate,
    ),
    ruralHealthUnitId: provider.rural_health_unit_id
      ? String(provider.rural_health_unit_id)
      : "",
    isActive: provider.is_active ?? provider.isActive ?? true,
    updatedAt: provider.updated_at || provider.updatedAt || "",
  };
}

/**
 * DOC-19 - the aggregate is computed by the server. The counts and
 * canSubmitReferral are read straight through and never re-derived here.
 */
export function normalizeAvailability(payload) {
  if (!payload) return EMPTY_AVAILABILITY;

  return {
    ruralHealthUnitId: payload.rural_health_unit_id
      ? String(payload.rural_health_unit_id)
      : null,
    availableCount: Number(payload.available_count || 0),
    totalCount: Number(payload.total_count || 0),
    status: normalizeAvailabilityStatus(payload.status),
    canSubmitReferral: Boolean(payload.can_submit_referral),
    updatedAt: payload.updated_at || "",
    providers: Array.isArray(payload.providers)
      ? payload.providers.map(normalizeProvider)
      : [],
  };
}

export function formatDoctorAvailabilitySummary(availability) {
  const { availableCount, totalCount } = availability || EMPTY_AVAILABILITY;
  return `${availableCount} of ${totalCount} doctors available`;
}

export function formatDoctorAvailabilityDate(value) {
  if (!value) return "Not updated yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

const MANILA_TIMEZONE = "Asia/Manila";

export function isDisplayedUnavailable(provider = {}) {
  const status =
    provider.effectiveAvailabilityStatus
    ?? provider.effective_availability_status
    ?? provider.availabilityStatus
    ?? provider.availability_status;
  return normalizeAvailabilityStatus(status) === AVAILABILITY_UNAVAILABLE;
}

export function splitExpectedReturn(value) {
  if (!value) return { date: "", time: "" };
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TIMEZONE }).format(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MANILA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return { date: dateKey, time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

export function combineExpectedReturn(date, time) {
  if (!date) return null;
  const clock = /^\d{2}:\d{2}$/.test(time || "") ? time : "09:00";
  return `${date}T${clock}:00+08:00`;
}

export function isExpectedReturnOverdue(provider = {}, now = new Date()) {
  if (provider.awaitingRhuUpdate || provider.awaiting_rhu_update) return true;
  if (!isDisplayedUnavailable(provider)) return false;
  const expected = provider.expectedAvailableAt ?? provider.expected_available_at;
  if (!expected) return false;
  const stamp = new Date(expected);
  return !Number.isNaN(stamp.getTime()) && stamp.getTime() <= now.getTime();
}

export function formatExpectedReturnStamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function bhcExpectedReturnLabel(provider = {}, now = new Date()) {
  if (!isDisplayedUnavailable(provider)) return "";
  if (isExpectedReturnOverdue(provider, now)) return AWAITING_RHU_UPDATE;
  return formatExpectedReturnStamp(
    provider.expectedAvailableAt ?? provider.expected_available_at,
  );
}

export function bhcCoordinationText(provider = {}, now = new Date()) {
  if (!isDisplayedUnavailable(provider)) return "";
  const remarks = String(provider.remarks || "").trim();
  const expected = bhcExpectedReturnLabel(provider, now);
  const expectedText = !expected
    ? ""
    : expected === AWAITING_RHU_UPDATE
      ? expected
      : `Expected return: ${expected}`;
  return [remarks, expectedText].filter(Boolean).join(" · ");
}

export function normalizeUnavailability(row = {}) {
  return {
    id: row.id ? String(row.id) : "",
    providerId: String(row.rhu_provider_id ?? row.providerId ?? ""),
    localDate: row.local_date || row.localDate || "",
    allDay: Boolean(row.all_day ?? row.allDay),
    startTime: row.start_time || row.startTime || null,
    endTime: row.end_time || row.endTime || null,
  };
}
