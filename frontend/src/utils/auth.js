import {
  getUser,
  loginUser as loginWithApi,
  logout,
} from "../services/authService";

export function loginUser(email, password) {
  return loginWithApi(email, password);
}

export function getCurrentUser() {
  return getUser();
}

export function logoutUser() {
  return logout();
}
