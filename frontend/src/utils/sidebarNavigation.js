import { normalizeReportCategory } from "./bhcReporting.js";
import { normalizeReferralView } from "./bhcReferralWorkspace.js";

/** Preserve an explicitly opened menu when route navigation remounts the layout. */
export function hasSidebarOpenIntent(location) {
  return Boolean(location.state?.openSidebarGroup && location.state.openSidebarGroup === location.pathname);
}

/** Match query-driven report children to the category actually rendered. */
export function isSidebarPathActive(path, location, role) {
  const [pathname, query] = path.split("?");
  if (query) {
    if (location.pathname !== pathname) return false;
    const actual = new URLSearchParams(location.search);
    return [...new URLSearchParams(query)].every(([key, value]) => {
      if (pathname === "/bhc/reports" && key === "type") {
        return (
          normalizeReportCategory(actual.get(key)) ===
          normalizeReportCategory(value)
        );
      }
      if (pathname === "/bhc/referrals" && key === "view") {
        return normalizeReferralView(actual) === value;
      }
      return actual.get(key) === value;
    });
  }
  if (location.pathname === pathname) return true;
  if (pathname === `/${role}/dashboard`) return false;
  return location.pathname.startsWith(pathname);
}
