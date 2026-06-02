import { apiRequest } from "../services/apiClient";

export const patientApi = {
  list: (query = "") => apiRequest(`/patients${query}`),
  get: (id) => apiRequest(`/patients/${id}`),
  create: (payload) => apiRequest("/patients", { method: "POST", body: payload }),
  update: (id, payload) => apiRequest(`/patients/${id}`, { method: "PATCH", body: payload }),
  remove: (id) => apiRequest(`/patients/${id}`, { method: "DELETE" }),
};
