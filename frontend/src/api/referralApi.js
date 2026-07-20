import { apiRequest } from "../services/apiClient";

export const referralApi = {
  list: (query = "") => apiRequest(`/referrals${query}`),
  get: (id) => apiRequest(`/referrals/${id}`),
  track: (value) =>
    apiRequest("/referrals/tracking/resolve", {
      method: "POST",
      body: { tracking_id: value },
    }),
  create: (payload) => apiRequest("/referrals", { method: "POST", body: payload }),
  updateStatus: (id, payload) =>
    apiRequest(`/referrals/${id}/status`, { method: "PATCH", body: payload }),
};
