import { normalizeReportCategory } from "./bhcReporting.js";
import { normalizeReferralView } from "./bhcReferralWorkspace.js";

export const PATIENT_VIEW_DIRECTORY = "patients";
export const PATIENT_VIEW_MONITORING = "monitoring-requests";
export const RHU_PATIENT_VIEW_QUEUE = "queue";
export const RHU_PATIENT_VIEW_ALL = "all";

/** BHC Patients sidebar children: directory vs monitoring handoffs. */
export function normalizePatientDirectoryView(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams || "");
  return params.get("view") === PATIENT_VIEW_MONITORING
    ? PATIENT_VIEW_MONITORING
    : PATIENT_VIEW_DIRECTORY;
}

/** RHU Patients sidebar children: today's queue vs full directory. */
export function normalizeRhuPatientView(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams || "");
  return params.get("view") === RHU_PATIENT_VIEW_ALL
    ? RHU_PATIENT_VIEW_ALL
    : RHU_PATIENT_VIEW_QUEUE;
}

/** Preserve an explicitly opened menu when route navigation remounts the layout. */
export function hasSidebarOpenIntent(location) {
  return Boolean(location.state?.openSidebarGroup && location.state.openSidebarGroup === location.pathname);
}

/** Match query-driven report children to the category actually rendered. */
export function isSidebarPathActive(path, location, role) {
  const [pathname, query] = path.split("?");
  const onMonitoringRequestDetail = location.pathname.startsWith(
    "/bhc/patients/monitoring-requests",
  );

  if (query) {
    const actual = new URLSearchParams(location.search);
    return [...new URLSearchParams(query)].every(([key, value]) => {
      if (pathname === "/bhc/reports" && key === "type") {
        if (location.pathname !== pathname) return false;
        return (
          normalizeReportCategory(actual.get(key)) ===
          normalizeReportCategory(value)
        );
      }
      if (pathname === "/bhc/referrals" && key === "view") {
        if (location.pathname !== pathname) return false;
        return normalizeReferralView(actual) === value;
      }
      if (pathname === "/bhc/patients" && key === "view") {
        if (value === PATIENT_VIEW_MONITORING) {
          return (
            onMonitoringRequestDetail ||
            (location.pathname === pathname &&
              normalizePatientDirectoryView(actual) === PATIENT_VIEW_MONITORING)
          );
        }
        if (value === PATIENT_VIEW_DIRECTORY) {
          return (
            location.pathname === pathname &&
            normalizePatientDirectoryView(actual) === PATIENT_VIEW_DIRECTORY
          );
        }
      }
      if (pathname === "/rhu/patients" && key === "view") {
        if (location.pathname !== pathname) return false;
        return normalizeRhuPatientView(actual) === value;
      }
      if (location.pathname !== pathname) return false;
      return actual.get(key) === value;
    });
  }

  if (location.pathname === pathname) return true;
  if (pathname === `/${role}/dashboard`) return false;
  // Handoff review is under Patients → Monitoring Requests, not the directory child.
  if (pathname === "/bhc/patients" && onMonitoringRequestDetail) return true;
  return location.pathname.startsWith(pathname);
}
