import { apiRequest, unwrapData, unwrapList } from "./apiClient";
import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_STATUSES,
  AVAILABILITY_UNAVAILABLE,
  EMPTY_AVAILABILITY,
  formatDoctorAvailabilityDate,
  formatDoctorAvailabilitySummary,
  normalizeAvailability,
  normalizeAvailabilityStatus,
  normalizeProvider,
} from "./doctorAvailabilityModel.js";

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

export {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_STATUSES,
  AVAILABILITY_UNAVAILABLE,
  EMPTY_AVAILABILITY,
  formatDoctorAvailabilityDate,
  formatDoctorAvailabilitySummary,
  normalizeAvailability,
  normalizeAvailabilityStatus,
  normalizeProvider,
};

export async function getDoctorAvailability(rhuId = null) {
  const response = await apiRequest(`/rhu-providers/availability${rhuId ? `?rural_health_unit_id=${encodeURIComponent(rhuId)}` : ""}`);
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
