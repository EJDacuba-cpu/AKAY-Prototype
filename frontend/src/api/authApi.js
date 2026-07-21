import { apiRequest, sessionRequestOptions } from "../services/apiClient";

export const authApi = {
  login: (payload) => apiRequest("/auth/login", {
    ...sessionRequestOptions({ method: "POST", body: payload }),
    auth: false,
  }),
  logout: () => apiRequest("/auth/logout", sessionRequestOptions({ method: "POST" })),
  profile: () => apiRequest("/auth/profile"),
  forgotPassword: (payload) =>
    apiRequest("/auth/forgot-password", { method: "POST", auth: false, body: payload }),
};
