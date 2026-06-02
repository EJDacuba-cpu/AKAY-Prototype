import { apiRequest } from "../services/apiClient";

export const authApi = {
  login: (payload) => apiRequest("/auth/login", { method: "POST", auth: false, body: payload }),
  logout: () => apiRequest("/auth/logout", { method: "POST" }),
  profile: () => apiRequest("/auth/profile"),
  forgotPassword: (payload) =>
    apiRequest("/auth/forgot-password", { method: "POST", auth: false, body: payload }),
};
