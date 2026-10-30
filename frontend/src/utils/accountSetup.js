import { roleFor } from "./staffRoles.js";

/**
 * Directory label for an account: its role name only.
 * `rolesData` is the GET /staff-roles payload; without it the raw role key is shown.
 */
export function roleLabel(user = {}, rolesData) {
  if ((user.backendRole || user.role) === "admin" || user.role === "Admin") return "Municipal Health Officer";
  if (!user.staff_role) return "Role not set";
  return roleFor(rolesData, user.staff_role)?.label || user.staff_role;
}

const ACCOUNT_TYPE_LABELS = { admin: "Admin account", bhc: "BHC account", rhu: "RHU account" };

/** Which kind of account it is ("BHC account"); the staff role says what the person does, this says where they sign in. */
export function accountTypeLabel(user = {}) {
  return ACCOUNT_TYPE_LABELS[user.backendRole || user.accountRole] || "";
}

/** The home facility as a sentence: the MHO covers the municipality, and anyone else without one has a gap to fix. */
export function homeFacilityLabel(user = {}, facilityName = user.facility) {
  if ((user.backendRole || user.accountRole) === "admin") return "Municipality-wide";
  return facilityName && facilityName !== "-" ? facilityName : "No facility assigned";
}

/** Additional BHC access that is in force today (not revoked, started, and not yet ended). */
export function activeFacilityAssignments(user = {}, today = new Date().toLocaleDateString("en-CA")) {
  return (user.facility_assignments || []).filter(
    (a) => !a.revoked_at && a.starts_on && a.starts_on.slice(0, 10) <= today && (!a.ends_on || a.ends_on.slice(0, 10) >= today),
  );
}

/** Pending Setup is mailbox proof, not the Active/Inactive administrative status. */
export function isPendingSetup(user = {}) {
  return !user?.email_verified_at;
}

export function setupStatusLabel(user = {}) {
  return isPendingSetup(user) ? "Pending Setup" : "Setup complete";
}

/** "Also covers Pitpitan BHC" or "Also covers 2 BHCs"; empty when the account has no additional access. */
export function additionalAccessLabel(user = {}) {
  const active = activeFacilityAssignments(user);
  if (active.length === 0) return "";
  if (active.length === 1) return `Also covers ${active[0].barangay_health_center?.name || "1 BHC"}`;
  return `Also covers ${active.length} BHCs`;
}
