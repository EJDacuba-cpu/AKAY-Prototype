import { apiRequest, unwrapData } from "./apiClient";
import { mapCareOverview } from "../utils/careOverview";

/** Pending follow-ups and unscheduled active monitoring for Start Consultation. */
export async function getCareOverview(patientId) {
  return mapCareOverview(unwrapData(await apiRequest(`/patients/${patientId}/care-overview`)) || {});
}
