import { apiRequest, unwrapData } from "./apiClient";

export async function loadAdminAccountAnalytics() {
  return unwrapData(await apiRequest("/reports/admin"));
}
