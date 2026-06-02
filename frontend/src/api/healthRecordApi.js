import { apiRequest } from "../services/apiClient";

export const healthRecordApi = {
  list: (query = "") => apiRequest(`/health-records${query}`),
  get: (id) => apiRequest(`/health-records/${id}`),
  create: (payload) => apiRequest("/health-records", { method: "POST", body: payload }),
  update: (id, payload) =>
    apiRequest(`/health-records/${id}`, { method: "PATCH", body: payload }),
  remove: (id) => apiRequest(`/health-records/${id}`, { method: "DELETE" }),
};
