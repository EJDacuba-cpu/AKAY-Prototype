import { apiRequest, unwrapData } from "./apiClient";

/** Role rules served by the backend (StaffRoles): roles, tiers, defaults and the duties available per tier. */
export async function getStaffRoles() {
  return unwrapData(await apiRequest("/staff-roles"));
}
