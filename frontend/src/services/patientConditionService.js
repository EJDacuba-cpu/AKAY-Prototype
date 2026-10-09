import { apiRequest, unwrapData } from "./apiClient";
import { mapPatientConditions } from "../utils/medicalConditions";

/** The patient's RHU-confirmed conditions and pre-confirmation monitorings. */
export async function getPatientConditions(patientId) {
  return mapPatientConditions(unwrapData(await apiRequest(`/patients/${patientId}/conditions`)) || {});
}
