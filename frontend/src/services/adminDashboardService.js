import { apiRequest, unwrapData } from "./apiClient";

/** Returns the raw (snake_case) dashboard summary for the given period. */
export async function loadAdminDashboard(period) {
  return unwrapData(await apiRequest(`/admin/dashboard?period=${encodeURIComponent(period)}`));
}
