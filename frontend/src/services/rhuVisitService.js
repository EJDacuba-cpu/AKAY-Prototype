import { apiRequest } from "./apiClient";

/** Check an existing patient into today's RHU queue as a walk-in. */
export async function checkInExistingPatient(patientId, checkInKey) {
  const response = await apiRequest("/rhu-visits", {
    method: "POST",
    body: { patient_id: Number(patientId), check_in_key: checkInKey },
  });
  return response?.data ?? null;
}
