import { normalizeReportCategory } from "./bhcReporting.js";
import { normalizeRhuReportCategory } from "./rhuReporting.js";
import { normalizeReferralView } from "./bhcReferralWorkspace.js";

export const PATIENT_VIEW_DIRECTORY = "patients";
export const PATIENT_VIEW_MONITORING = "monitoring-requests";
export const RHU_PATIENT_VIEW_QUEUE = "queue";
export const RHU_PATIENT_VIEW_ALL = "all";
export const RHU_INTAKE_PARENT_PATH = "/rhu/patient-intake";
export const RHU_MEDICINE_PARENT_PATH = "/rhu/medicine-and-supply";
export const ADMIN_ACCOUNT_MANAGEMENT_PARENT_PATH = "/admin/account-management";

export function isRhuPatientIntakePath(pathname = "") {
  return (
    pathname === RHU_INTAKE_PARENT_PATH ||
    pathname === "/rhu/incoming-referrals" ||
    pathname === "/rhu/walk-in-check-in" ||
    pathname === "/rhu/qr-scanner" ||
    /^\/rhu\/referrals\/[^/]+$/.test(pathname)
  );
}

export function isRhuMedicinePath(pathname = "") {
  return (
    pathname === RHU_MEDICINE_PARENT_PATH ||
    pathname === "/rhu/medicine-management" ||
    pathname === "/rhu/to-dispense" ||
    /^\/rhu\/medicine-management\/[^/]+$/.test(pathname)
  );
}

export function isAdminAccountManagementPath(pathname = "") {
  return (
    pathname === ADMIN_ACCOUNT_MANAGEMENT_PARENT_PATH ||
    pathname === "/admin/users" ||
    pathname.startsWith("/admin/users/") ||
    pathname === "/admin/doctors/add" ||
    pathname === "/admin/password-reset-requests" ||
    pathname === "/admin/account-invites"
  );
}

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

/**
 * Hide denied `hideWhenDenied` children. Retarget `defaultPath` only when that
 * exact child was removed. Query-style parents (bare defaultPath, query children)
 * keep their original defaultPath.
 */
export function applySidebarAccess(item, user, navigationAllowed) {
  const rawChildren = item.children;
  const children = rawChildren?.filter(
    (child) => !(child.hideWhenDenied && !navigationAllowed(user, child.path)),
  );
  let defaultPath = item.defaultPath;
  if (rawChildren?.length && children) {
    const defaultWasAmongRaw = rawChildren.some((child) => child.path === item.defaultPath);
    const defaultStillPresent = children.some((child) => child.path === item.defaultPath);
    if (defaultWasAmongRaw && !defaultStillPresent) {
      defaultPath = children[0]?.path ?? item.defaultPath;
    }
  }
  return {
    ...item,
    ...(children ? { children, defaultPath } : {}),
    locked: !navigationAllowed(user, item.path),
  };
}

/** Preserve an explicitly opened menu when route navigation remounts the layout. */
export function hasSidebarOpenIntent(location) {
  const openSidebarGroup = location.state?.openSidebarGroup;
  if (!openSidebarGroup) return false;
  if (
    openSidebarGroup === RHU_INTAKE_PARENT_PATH &&
    isRhuPatientIntakePath(location.pathname)
  ) {
    return true;
  }
  if (
    openSidebarGroup === RHU_MEDICINE_PARENT_PATH &&
    isRhuMedicinePath(location.pathname)
  ) {
    return true;
  }
  if (
    openSidebarGroup === ADMIN_ACCOUNT_MANAGEMENT_PARENT_PATH &&
    isAdminAccountManagementPath(location.pathname)
  ) {
    return true;
  }
  return openSidebarGroup === location.pathname;
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
      if (pathname === "/rhu/reports" && key === "type") {
        if (location.pathname !== pathname) return false;
        return (
          normalizeRhuReportCategory(actual.get(key)) ===
          normalizeRhuReportCategory(value)
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

  if (pathname === RHU_INTAKE_PARENT_PATH) {
    return isRhuPatientIntakePath(location.pathname);
  }

  if (pathname === RHU_MEDICINE_PARENT_PATH) {
    return isRhuMedicinePath(location.pathname);
  }

  if (pathname === ADMIN_ACCOUNT_MANAGEMENT_PARENT_PATH) {
    return isAdminAccountManagementPath(location.pathname);
  }

  if (location.pathname === pathname) return true;
  if (pathname === `/${role}/dashboard`) return false;
  // Handoff review is under Patients → Monitoring Requests, not the directory child.
  if (pathname === "/bhc/patients" && onMonitoringRequestDetail) return true;
  return location.pathname.startsWith(pathname);
}
