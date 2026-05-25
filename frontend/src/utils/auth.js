import {
  getUser,
  loginUser as loginWithDemoAccounts,
  logout,
} from "../services/authService";

export function loginUser(email, password) {
  return loginWithDemoAccounts(email, password);
}

export function getCurrentUser() {
  return getUser();
}

export function logoutUser() {
  logout();
}
