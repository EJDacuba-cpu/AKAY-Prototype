import { apiRequest, unwrapData } from "./apiClient";

/** Close the patient's active Nutrition Care episode. Returns the updated summary. */
export async function closeNutritionCare(patientId, { reason, closedOn, note } = {}) {
  return unwrapData(await apiRequest(`/patients/${patientId}/nutrition-care/close`, {
    method: "POST",
    body: {
      reason,
      closed_on: closedOn,
      note: note ? String(note) : null,
    },
  }));
}
