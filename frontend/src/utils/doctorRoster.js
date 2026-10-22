import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
} from "../services/doctorAvailabilityModel.js";

export const ROSTER_STATUS = {
  ALL: "all",
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
};

export function isOfficialProvider(provider) {
  return Boolean(provider?.userId);
}

export function rosterCounts(providers = []) {
  const list = Array.isArray(providers) ? providers : [];
  return {
    all: list.length,
    available: list.filter((provider) => provider.availabilityStatus === AVAILABILITY_AVAILABLE).length,
    unavailable: list.filter((provider) => provider.availabilityStatus === AVAILABILITY_UNAVAILABLE).length,
  };
}

export function filterDoctorRoster(providers = [], { status = ROSTER_STATUS.ALL, query = "" } = {}) {
  const needle = query.trim().toLowerCase();

  return (Array.isArray(providers) ? providers : []).filter((provider) => {
    if (status === ROSTER_STATUS.AVAILABLE && provider.availabilityStatus !== AVAILABILITY_AVAILABLE) {
      return false;
    }
    if (status === ROSTER_STATUS.UNAVAILABLE && provider.availabilityStatus !== AVAILABILITY_UNAVAILABLE) {
      return false;
    }
    if (!needle) {
      return true;
    }
    const haystack = `${provider.name || ""} ${provider.specialization || ""}`.toLowerCase();
    return haystack.includes(needle);
  });
}
