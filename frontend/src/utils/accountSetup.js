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
