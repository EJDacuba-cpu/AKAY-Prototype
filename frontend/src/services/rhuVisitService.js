import { apiRequest } from "./apiClient";

/** Active visits in today's RHU queue, oldest first. */
export async function listRhuVisits() {
  const response = await apiRequest("/rhu-visits");
  return response?.data ?? [];
}

/** Patients this RHU may check in, found by name tokens, PhilHealth or contact number. */
export async function searchPatientsForCheckIn(query) {
  const response = await apiRequest(`/rhu-visits/patient-search?q=${encodeURIComponent(query)}`);
  return response?.data ?? [];
}

/** Check an existing patient into today's RHU queue as a walk-in. */
export async function checkInExistingPatient(patientId, checkInKey) {
  const response = await apiRequest("/rhu-visits", {
    method: "POST",
    body: { patient_id: Number(patientId), check_in_key: checkInKey },
  });
  return response?.data ?? null;
}
