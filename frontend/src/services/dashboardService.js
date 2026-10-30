import { apiRequest, unwrapData } from "./apiClient";

export async function getBhcDashboardSummary() {
  return unwrapData(await apiRequest("/bhc/dashboard"));
}
