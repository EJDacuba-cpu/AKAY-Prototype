import { matchPath } from "react-router";

/**
 * Navigation context for the Patient Profile.
 *
 * Only route paths ever go into history state here - never clinical data -
 * so the consultation's "no browser storage" rule still holds.
 */

export const CONSULTATION_PROFILE_SOURCE = "health-record-consultation";
export const BHC_PATIENT_PROFILE_PATH = "/bhc/patients/:patientId";
export const RHU_PATIENT_PROFILE_PATH = "/rhu/patients/:patientId";
const PATIENT_PROFILE_PATHS = [BHC_PATIENT_PROFILE_PATH, RHU_PATIENT_PROFILE_PATH];

export function locationToPath(location) {
  if (!location) return "";
  return `${location.pathname || ""}${location.search || ""}${location.hash || ""}`;
}

function isInternalPath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

function matchPatientProfile(pathname) {
  if (typeof pathname !== "string") return null;
  for (const pattern of PATIENT_PROFILE_PATHS) {
    const match = matchPath(pattern, pathname);
    if (match) return match;
  }
  return null;
}

/** Where the profile's Back button goes; falls back to the Patients list. */
export function getProfileReturnPath(location, fallback) {
  const returnTo = location?.state?.returnTo;
  return isInternalPath(returnTo) ? returnTo : fallback;
}

/** State for a plain profile link from a page Back should return to. */
export function buildProfileReturnState(location) {
  return { returnTo: locationToPath(location) };
}

export function patientRecordsPath(patientId, basePath = "/bhc") {
  return patientId ? `${basePath}/patients/${encodeURIComponent(patientId)}?tab=records` : `${basePath}/patients`;
}

export function bhcPatientRecordsPath(patientId) {
  return patientRecordsPath(patientId, "/bhc");
}

/** Only navigation metadata crosses the details route; filters stay in session memory. */
export function buildPatientRecordDetailsState(location) {
  return { patientProfile: { path: locationToPath(location), state: location.state || null } };
}

export function getPatientRecordReturn(location, patientId, basePath = "/bhc") {
  const origin = location?.state?.patientProfile;
  const path = origin?.path;
  const pathname = typeof path === "string" ? path.split(/[?#]/)[0] : "";
  const match = matchPatientProfile(pathname);
  if (match && (!patientId || String(match.params.patientId) === String(patientId))) {
    return { path, state: origin.state || null };
  }
  return { path: patientRecordsPath(patientId, basePath), state: null };
}

/**
 * State for "View Full Profile" during a consultation. The consultation's own
 * location rides along so App can keep that page mounted, hidden, underneath
 * the profile instead of tearing it down.
 */
export function buildConsultationProfileState(location, scrollTop = 0) {
  return {
    source: CONSULTATION_PROFILE_SOURCE,
    returnTo: locationToPath(location),
    backgroundLocation: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    },
    scrollTop,
  };
}

/**
 * The consultation location to keep mounted behind the current page, or null.
 * Honoured only on the BHC patient profile, so a stale state object can never
 * hide some other page.
 */
export function getConsultationBackground(location) {
  const state = location?.state;
  if (state?.source !== CONSULTATION_PROFILE_SOURCE) return null;
  if (!matchPath(BHC_PATIENT_PROFILE_PATH, location.pathname)) return null;
  const background = state.backgroundLocation;
  return background && isInternalPath(background.pathname) ? background : null;
}
