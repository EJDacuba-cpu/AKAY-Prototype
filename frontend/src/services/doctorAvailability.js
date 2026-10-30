import { apiRequest, unwrapData, unwrapList } from "./apiClient";
import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_STATUSES,
  AVAILABILITY_UNAVAILABLE,
  EMPTY_AVAILABILITY,
  bhcCoordinationText,
  bhcExpectedReturnLabel,
  combineExpectedReturn,
  formatDoctorAvailabilityDate,
  formatDoctorAvailabilitySummary,
  formatExpectedReturnStamp,
  normalizeAvailability,
  normalizeAvailabilityStatus,
  normalizeProvider,
  normalizeUnavailability,
  splitExpectedReturn,
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
  bhcCoordinationText,
  bhcExpectedReturnLabel,
  combineExpectedReturn,
  formatDoctorAvailabilityDate,
  formatDoctorAvailabilitySummary,
  formatExpectedReturnStamp,
  normalizeAvailability,
  normalizeAvailabilityStatus,
  normalizeProvider,
  normalizeUnavailability,
  splitExpectedReturn,
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

export async function getProviderUnavailability(providerId, { from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  const response = await apiRequest(
    `/rhu-providers/${providerId}/unavailability${query ? `?${query}` : ""}`,
  );
  return unwrapList(response).map(normalizeUnavailability);
}

export async function createProviderUnavailability(providerId, payload) {
  const response = await apiRequest(`/rhu-providers/${providerId}/unavailability`, {
    method: "POST",
    body: {
      local_date: payload.localDate,
      all_day: Boolean(payload.allDay),
      start_time: payload.allDay ? null : payload.startTime,
      end_time: payload.allDay ? null : payload.endTime,
    },
  });
  return normalizeUnavailability(unwrapData(response));
}

export async function updateProviderUnavailability(providerId, exceptionId, payload) {
  const response = await apiRequest(
    `/rhu-providers/${providerId}/unavailability/${exceptionId}`,
    {
      method: "PATCH",
      body: {
        ...(payload.localDate !== undefined ? { local_date: payload.localDate } : {}),
        ...(payload.allDay !== undefined ? { all_day: Boolean(payload.allDay) } : {}),
        ...(payload.allDay === true
          ? { start_time: null, end_time: null }
          : {
              ...(payload.startTime !== undefined ? { start_time: payload.startTime } : {}),
              ...(payload.endTime !== undefined ? { end_time: payload.endTime } : {}),
            }),
      },
    },
  );
  return normalizeUnavailability(unwrapData(response));
}

export async function deleteProviderUnavailability(providerId, exceptionId) {
  await apiRequest(`/rhu-providers/${providerId}/unavailability/${exceptionId}`, {
    method: "DELETE",
  });
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
  if (provider.internalNotes !== undefined) {
    payload.internal_notes = provider.internalNotes || null;
  }
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
