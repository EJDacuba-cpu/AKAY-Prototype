import { queryClient } from "../lib/queryClient";
import { API_BASE_URL } from "../config/environment";
import {
  clearSensitiveSessionState,
  isForcedSessionInvalidation,
} from "../utils/sessionPrivacy";

const TOKEN_KEY = "akay_auth_token";
const USER_KEY = "akay_auth_user";
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS) || 30000;
const SESSION_REQUEST_HEADERS = { "X-AKAY-Session": "1" };

let accessToken = null;
let authenticatedUser = null;
let refreshPromise = null;

export function getAuthToken() {
  return accessToken;
}

export function getStoredAuthUser() {
  return authenticatedUser;
}

export function mapRoleForFrontend(role) {
  if (role === "bhw") return "bhc";
  if (role === "rhu_staff") return "rhu";
  return role || "";
}

export function mapRoleForBackend(role) {
  if (role === "bhc" || role === "BHC" || role === "bhc_worker") return "bhw";
  if (role === "rhu" || role === "RHU" || role === "rhu_staff") return "rhu_staff";
  return String(role || "admin").toLowerCase();
}

export function normalizeUser(user = {}) {
  const frontendRole = mapRoleForFrontend(user.role);
  const assignedFacility =
    user.facility && typeof user.facility === "object" ? user.facility : null;
  const bhc =
    user.barangay_health_center ||
    user.barangayHealthCenter ||
    (assignedFacility?.type === "bhc" ? assignedFacility : null);
  const rhu =
    user.rural_health_unit ||
    user.ruralHealthUnit ||
    (assignedFacility?.type === "rhu" ? assignedFacility : null);

  return {
    ...user,
    id: user.id ? String(user.id) : "",
    role: frontendRole,
    backendRole: user.role,
    name: user.name || user.fullName || "",
    fullName: user.fullName || user.name || "",
    status:
      String(user.status || "active").toLowerCase() === "active"
        ? "Active"
        : "Inactive",
    facility:
      assignedFacility?.name ||
      bhc?.name ||
      rhu?.name ||
      (typeof user.facility === "string" ? user.facility : "") ||
      user.assignedBarangayHealthCenter ||
      user.assignedRuralHealthUnit ||
      "",
    assignedBarangayHealthCenter:
      bhc?.name || user.assignedBarangayHealthCenter || "",
    assignedRuralHealthUnit: rhu?.name || user.assignedRuralHealthUnit || "",
    facilityId:
      assignedFacility?.id ||
      user.barangay_health_center_id ||
      user.rural_health_unit_id ||
      bhc?.id ||
      rhu?.id ||
      user.facilityId ||
      "",
    barangayHealthCenterId: user.barangay_health_center_id || bhc?.id || "",
    ruralHealthUnitId: user.rural_health_unit_id || rhu?.id || "",
  };
}

export function storeAuthSession({ token, user }) {
  if (token) accessToken = token;
  if (user) authenticatedUser = normalizeUser(user);

  removeLegacyPersistedAuth();
}

export function clearAuthSession() {
  accessToken = null;
  authenticatedUser = null;
  removeLegacyPersistedAuth();
}

function removeLegacyPersistedAuth() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(USER_KEY);
  } catch {
    // Memory-only authentication remains cleared if browser storage is blocked.
  }
}

function createOfflineError() {
  const error = new Error("You are offline. Please reconnect and try again.");
  error.code = "OFFLINE";
  error.isOffline = true;
  return error;
}

async function sendRequest(endpoint, options = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw createOfflineError();
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (accessToken && options.auth !== false) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const controller = new AbortController();
  let timeoutId;
  const timeoutError = new Error(
    "The server took too long to respond. Please check the API connection and try again.",
  );
  timeoutError.code = "TIMEOUT";
  timeoutError.isTimeout = true;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, REQUEST_TIMEOUT_MS);
  });
  const requestPromise = fetch(url, {
    ...options,
    headers,
    cache: options.cache || "no-store",
    credentials: options.credentials || "omit",
    signal: options.signal || controller.signal,
    body:
      options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  }).catch((error) => {
    if (error.name === "AbortError") throw timeoutError;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw createOfflineError();
    }

    error.code ||= "NETWORK_ERROR";
    error.isNetworkError = true;
    throw error;
  });
  const response = await Promise.race([requestPromise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const firstValidationError = payload.errors
      ? Object.values(payload.errors).flat()[0]
      : null;
    const error = new Error(
      payload.message || firstValidationError || "API request failed.",
    );
    error.status = response.status;
    error.code = payload.code || "";
    error.errors = payload.errors || {};
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function refreshAuthSession() {
  if (!refreshPromise) {
    const requestRefresh = () =>
      sendRequest("/auth/refresh", {
        method: "POST",
        auth: false,
        credentials: "include",
        headers: SESSION_REQUEST_HEADERS,
      });
    const refreshRequest = globalThis.navigator?.locks?.request
      ? globalThis.navigator.locks.request("akay-auth-refresh", requestRefresh)
      : requestRefresh();

    refreshPromise = refreshRequest
      .then((response) => {
        if (!response?.token || !response?.user) {
          const error = new Error("Unable to restore authenticated session.");
          error.status = 401;
          error.code = "SESSION_INVALID";
          throw error;
        }

        storeAuthSession({ token: response.token, user: response.user });
        return getStoredAuthUser();
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function invalidateFrontendSession(error) {
  await clearSensitiveSessionState({
    queryClient,
    reason: error?.code === "SESSION_EXPIRED" ? "session-expired" : "session-invalid",
  });
  clearAuthSession();
}

export async function apiRequest(endpoint, options = {}) {
  try {
    return await sendRequest(endpoint, options);
  } catch (error) {
    const canRefresh =
      error?.status === 401 &&
      options.auth !== false &&
      options.retryAfterRefresh !== false;

    if (canRefresh) {
      try {
        await refreshAuthSession();
        return await sendRequest(endpoint, {
          ...options,
          retryAfterRefresh: false,
        });
      } catch (refreshError) {
        await invalidateFrontendSession(refreshError);
        throw refreshError;
      }
    }

    if (isForcedSessionInvalidation(error?.status, error?.payload)) {
      await invalidateFrontendSession(error);
    }

    throw error;
  }
}

export function sessionRequestOptions(options = {}) {
  return {
    ...options,
    credentials: "include",
    headers: {
      ...SESSION_REQUEST_HEADERS,
      ...(options.headers || {}),
    },
  };
}

export function unwrapList(payload) {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export function unwrapData(payload) {
  return payload?.data ?? payload;
}

export function isConnectionError(error = {}) {
  return Boolean(
    error.isOffline ||
      error.isTimeout ||
      error.isNetworkError ||
      error.code === "OFFLINE" ||
      error.code === "TIMEOUT" ||
      error.code === "NETWORK_ERROR" ||
      [502, 503, 504].includes(Number(error.status)),
  );
}
