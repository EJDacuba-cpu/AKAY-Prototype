import { apiRequest, unwrapData, unwrapList } from "./apiClient";

/**
 * RHU provider availability - server-backed (DOC-BACKEND, DOC-19, DOC-20).
 *
 * This module previously kept the whole roster in window.localStorage, so a
 * BHW's browser and an RHU's browser held completely separate data and the
 * "N of M doctors available" a BHC saw was whatever had been typed in that
 * same browser profile. The roster is now owned by the RHU on the server
 * (DOC-15) and read through the API.
 *
 * The former synchronous exports (getDoctorAvailability() returning a value)
 * could not survive that move and were deliberately not preserved: a
 * server-backed read cannot return data during a React state initialiser.
 * Consumers use the TanStack Query hooks in hooks/useDoctorAvailability.js,
 * matching how every other AKAY resource is read.
 */

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
  return {
    id: provider.id ? String(provider.id) : "",
    name: provider.name || "",
    specialization: provider.specialization || "",
    availabilityStatus: normalizeAvailabilityStatus(
      provider.availability_status ?? provider.availabilityStatus,
    ),
    remarks: provider.remarks || "",
    // Display only - an RHU-supplied estimate, never used to derive
    // availabilityStatus or canSubmitReferral (see DoctorSchedule.jsx).
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
 * canSubmitReferral are read straight through and never re-derived here: the
 * DOC-14 rule has exactly one authority, and it is not the browser.
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

export async function getDoctorAvailability() {
  const response = await apiRequest("/rhu-providers/availability");
  return normalizeAvailability(unwrapData(response));
}

export async function getRhuProviders() {
  const response = await apiRequest("/rhu-providers");
  return unwrapList(response).map(normalizeProvider);
}

export async function createRhuProvider(provider = {}) {
  const response = await apiRequest("/rhu-providers", {
    method: "POST",
    body: toPayload(provider),
  });
  return normalizeProvider(unwrapData(response));
}

export async function updateRhuProvider(providerId, changes = {}) {
  const response = await apiRequest(`/rhu-providers/${providerId}`, {
    method: "PATCH",
    body: toPayload(changes),
  });
  return normalizeProvider(unwrapData(response));
}

export async function deactivateRhuProvider(providerId) {
  await apiRequest(`/rhu-providers/${providerId}`, { method: "DELETE" });
  return true;
}

function toPayload(provider = {}) {
  const payload = {};

  if (provider.name !== undefined) payload.name = provider.name;
  if (provider.specialization !== undefined) {
    payload.specialization = provider.specialization || null;
  }
  if (provider.availabilityStatus !== undefined) {
    payload.availability_status = normalizeAvailabilityStatus(
      provider.availabilityStatus,
    );
  }
  if (provider.remarks !== undefined) payload.remarks = provider.remarks || null;
  if (provider.expectedAvailableAt !== undefined) {
    payload.expected_available_at = provider.expectedAvailableAt || null;
  }

  return payload;
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

export default {
  getDoctorAvailability,
  getRhuProviders,
  createRhuProvider,
  updateRhuProvider,
  deactivateRhuProvider,
  normalizeAvailability,
  normalizeProvider,
  formatDoctorAvailabilitySummary,
  formatDoctorAvailabilityDate,
};
