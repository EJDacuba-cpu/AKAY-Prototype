import {
  getUser,
  loginUser as loginWithApi,
  logout,
  restoreSession,
} from "../services/authService";
import { clearAuthSession, getAuthToken } from "../services/apiClient";

export function loginUser(email, password) {
  return loginWithApi(email, password);
}

export function getCurrentUser() {
  return getUser();
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
