import {
  apiRequest,
  clearAuthSession,
  getStoredAuthUser,
  normalizeUser,
  storeAuthSession,
} from "./apiClient";

export function getUser() {
  return getStoredAuthUser();
}

export async function restoreSession() {
  const response = await apiRequest("/auth/profile");
  const user = response?.user || response?.data?.user || response?.data;

  if (!user) {
    throw new Error("Unable to restore authenticated session.");
  }

  storeAuthSession({ user });
  return normalizeUser(user);
}

export function saveUser(user) {
  const normalized = normalizeUser(user);
  storeAuthSession({ user: normalized });
  return normalized;
}

export async function logout() {
  try {
    await apiRequest("/auth/logout", { method: "POST" });
  } finally {
    clearAuthSession();
  }
}

export async function loginUser(email, password) {
  const response = await apiRequest("/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });

  storeAuthSession({ token: response.token, user: response.user });
  return normalizeUser(response.user);
}
