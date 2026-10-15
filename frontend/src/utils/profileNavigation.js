import { matchPath } from "react-router";

/**
 * Navigation context for the Patient Profile.
 *
 * Only route paths ever go into history state here - never clinical data -
 * so the consultation's "no browser storage" rule still holds.
 */

export const CONSULTATION_PROFILE_SOURCE = "health-record-consultation";
export const BHC_PATIENT_PROFILE_PATH = "/bhc/patients/:patientId";

export function locationToPath(location) {
  if (!location) return "";
  return `${location.pathname || ""}${location.search || ""}${location.hash || ""}`;
}

function isInternalPath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
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

export function bhcPatientRecordsPath(patientId) {
  return patientId ? `/bhc/patients/${encodeURIComponent(patientId)}?tab=records` : "/bhc/patients";
}

/** Only navigation metadata crosses the details route; filters stay in session memory. */
export function buildPatientRecordDetailsState(location) {
  return { patientProfile: { path: locationToPath(location), state: location.state || null } };
}

export function getPatientRecordReturn(location, patientId) {
  const origin = location?.state?.patientProfile;
  const path = origin?.path;
  const match = typeof path === "string" && matchPath(BHC_PATIENT_PROFILE_PATH, path.split(/[?#]/)[0]);
  if (match && (!patientId || String(match.params.patientId) === String(patientId))) {
    return { path, state: origin.state || null };
  }
  return { path: bhcPatientRecordsPath(patientId), state: null };
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
