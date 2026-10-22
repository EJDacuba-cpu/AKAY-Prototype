export const AVAILABILITY_AVAILABLE = "Available";
export const AVAILABILITY_UNAVAILABLE = "Unavailable";

export const AVAILABILITY_STATUSES = [
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
];

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
    remarks: provider.remarks || "",
    expectedAvailableAt:
      provider.expected_available_at || provider.expectedAvailableAt || "",
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
