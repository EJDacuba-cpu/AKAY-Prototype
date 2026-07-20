import {
  apiRequest,
  clearAuthSession,
  getStoredAuthUser,
  normalizeUser,
  storeAuthSession,
} from "./apiClient";
import { queryClient } from "../lib/queryClient";
import {
  clearSensitiveSessionState,
  isSameSessionIdentity,
} from "../utils/sessionPrivacy";

export function getUser() {
  return getStoredAuthUser();
}

export async function restoreSession() {
  const previousUser = getStoredAuthUser();
  const response = await apiRequest("/auth/profile");
  const user = response?.user || response?.data?.user || response?.data;

  if (!user) {
    throw new Error("Unable to restore authenticated session.");
  }

  const normalized = normalizeUser(user);
  if (previousUser && !isSameSessionIdentity(previousUser, normalized)) {
    await clearSensitiveSessionState({
      queryClient,
      reason: "authenticated-context-changed",
      preserveAuthentication: true,
    });
  }

  storeAuthSession({ user: normalized });
  return normalized;
}

export function saveUser(user) {
  const normalized = normalizeUser(user);
  storeAuthSession({ user: normalized });
  return normalized;
}

export async function logout() {
  const logoutRequest = apiRequest("/auth/logout", { method: "POST" }).then(
    (value) => ({ value, error: null }),
    (error) => ({ value: null, error }),
  );

  try {
    await clearSensitiveSessionState({
      queryClient,
      reason: "logout",
    });
  } finally {
    clearAuthSession();
  }

  const result = await logoutRequest;
  if (result.error) throw result.error;
  return result.value;
}

export async function loginUser(email, password) {
  const previousUser = getStoredAuthUser();
  const response = await apiRequest("/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });

  const normalized = normalizeUser(response.user);
  await clearSensitiveSessionState({
    queryClient,
    reason: previousUser && !isSameSessionIdentity(previousUser, normalized)
      ? "account-switched"
      : "login-initialized",
    broadcast: Boolean(
      previousUser && !isSameSessionIdentity(previousUser, normalized),
    ),
    preserveAuthentication: true,
  });
  storeAuthSession({ token: response.token, user: normalized });
  return normalized;
}
