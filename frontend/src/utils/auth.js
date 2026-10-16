import {
  getUser,
  loginUser as loginWithApi,
  logout,
  restoreSession,
} from "../services/authService";
import { clearAuthSession, getAuthToken } from "../services/apiClient";
import { withFamilyAccess } from "../services/mockFamilyAccess";

export function loginUser(email, password) {
  return loginWithApi(email, password);
}

export function getCurrentUser() {
  const user = getUser();
  return user?.role === "rhu" ? withFamilyAccess(user) : user;
}

export function getStoredAuthToken() {
  return getAuthToken();
}

export function clearStoredAuthSession() {
  clearAuthSession();
}

export function restoreCurrentUserSession() {
  return restoreSession();
}

export function logoutUser() {
  return logout();
}
