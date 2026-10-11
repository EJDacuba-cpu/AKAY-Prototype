import { ALL_PERMISSIONS, LICENSED_PERMISSIONS } from "./actionPermissions.js";

// `users.role` holds the account type; its BHC and RHU values match the facility types.
export const TIERS = { bhc: "bhc", rhu: "rhu", admin: "admin" };

// Every helper takes `rolesData`, the GET /staff-roles payload, so the frontend keeps no copy of role rules.

export function roleFor(rolesData, key) {
  return rolesData?.roles?.find(role => role.key === key);
}

export function rolesForTier(rolesData, tier) {
  return (rolesData?.roles || []).filter(role => role.tier === tier);
}

export function availableDuties(rolesData, tier) {
  const available = rolesData?.available?.[tier] || [];
  return ALL_PERMISSIONS.filter(key => available.includes(key));
}

export function roleDefaults(rolesData, key) {
  return roleFor(rolesData, key)?.defaults || [];
}

/** Licensed duties held by a role that is not licensed to perform them. */
export function licensedGrants(rolesData, key, permissions) {
  return roleFor(rolesData, key)?.licensed ? [] : permissions.filter(p => LICENSED_PERMISSIONS.includes(p));
}

/** True when switching away from `currentKey` would discard changes the admin made to its defaults. */
export function needsReplaceConfirm(rolesData, currentKey, permissions) {
  if (!currentKey) return false;
  const defaults = roleDefaults(rolesData, currentKey);
  return defaults.length !== permissions.length || defaults.some(p => !permissions.includes(p));
}

export function normalizeContactNumber(value) {
  return String(value || "").replace(/[\s-]/g, "");
}

export function isValidContactNumber(value) {
  return /^09\d{9}$/.test(normalizeContactNumber(value));
}

/** Moves the form to a facility. Another tier invalidates the role and its duties; another facility of the same tier does not. */
export function applyFacilityChange(form, tier, facilityId) {
  const next = {
    ...form,
    role: tier,
    barangay_health_center_id: tier === TIERS.bhc ? facilityId : null,
    rural_health_unit_id: tier === TIERS.rhu ? facilityId : null,
  };
  return tier === form.role ? next : { ...next, staff_role: "", permissions: [] };
}
