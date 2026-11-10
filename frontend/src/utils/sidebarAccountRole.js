import { formatFacilityName } from "./formatters.js";

/** Compact staff-role labels for the sidebar account card (mirrors StaffRoles). */
const STAFF_ROLE_LABELS = {
  midwife: "Midwife",
  bhw: "BHW",
  encoder: "Encoder",
  nurse: "Nurse",
  doctor: "Doctor",
  intake_staff: "RHU Staff",
};

const TIER_FALLBACK = {
  admin: "Admin",
  bhc: "BHC Staff",
  rhu: "RHU Staff",
};

function accountTier(user = {}) {
  return user.backendRole || user.accountRole || user.role;
}

/**
 * Short role line under the signed-in name.
 * Admin → "Admin". Everyone else → staff role (Midwife, Doctor, …), not facility type alone.
 */
export function sidebarAccountRoleLabel(user = {}) {
  const accountRole = accountTier(user);
  if (accountRole === "admin" || user.role === "Admin") return "Admin";
  if (user.staff_role) return STAFF_ROLE_LABELS[user.staff_role] || user.staff_role;
  return TIER_FALLBACK[accountRole] || "Personnel";
}

/** Home/registered facility for the account card — not a temporary working-facility switch. */
export function sidebarHomeFacilityName(user = {}) {
  const accountRole = accountTier(user);
  if (accountRole === "admin" || user.role === "Admin") return "";

  let raw = null;
  if (accountRole === "bhc") {
    raw =
      user.assignedBarangayHealthCenter ||
      user.barangay_health_center ||
      user.barangayHealthCenter;
  } else if (accountRole === "rhu") {
    raw =
      user.assignedRuralHealthUnit ||
      user.rural_health_unit ||
      user.ruralHealthUnit;
  }

  // Single-facility accounts may only expose the current facility string.
  if (!raw) raw = user.facility_name || user.facilityName || user.facility;

  const name = formatFacilityName(raw, "");
  if (!name || name === "No facility assigned") return "";
  return name;
}

/** Second line: "Admin", or "Midwife · Pitpitan", or "Doctor · RHU 2". */
export function sidebarAccountSubtitle(user = {}) {
  const role = sidebarAccountRoleLabel(user);
  if (role === "Admin") return "Admin";
  const facility = sidebarHomeFacilityName(user);
  return facility ? `${role} · ${facility}` : role;
}
