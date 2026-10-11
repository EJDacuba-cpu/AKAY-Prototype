import { licensedGrants, roleFor } from "./staffRoles.js";

/**
 * Directory label for an account: its role, plus how far its duties moved from the role defaults.
 * `rolesData` is the GET /staff-roles payload; without it the raw role key is shown.
 */
export function accessSummary(user = {}, rolesData) {
  const plain = label => ({ label, custom: false, licensed: false });
  if ((user.backendRole || user.role) === "admin" || user.role === "Admin") return plain("Municipal Health Officer");
  if (!user.staff_role) return plain("Role not set");
  const role = roleFor(rolesData, user.staff_role);
  if (!role) return plain(user.staff_role);

  const permissions = Array.isArray(user.permissions) ? user.permissions : role.defaults;
  const added = permissions.filter(p => !role.defaults.includes(p)).length;
  const removed = role.defaults.filter(p => !permissions.includes(p)).length;
  const licensed = licensedGrants(rolesData, role.key, permissions).length > 0;
  if (!added && !removed) return { label: role.label, custom: false, licensed };
  return { label: `${role.label} · Custom (+${added}, −${removed})`, custom: true, licensed };
}
