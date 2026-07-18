const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000/api";

const TOKEN_KEY = "akay_auth_token";
const USER_KEY = "akay_auth_user";
const REQUEST_TIMEOUT_MS = 15000;

function readJson(key, fallback = null) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function getAuthToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredAuthUser() {
  return readJson(USER_KEY, null);
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
  const bhc = user.barangay_health_center || user.barangayHealthCenter || null;
  const rhu = user.rural_health_unit || user.ruralHealthUnit || null;

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
      bhc?.name ||
      rhu?.name ||
      user.facility ||
      user.assignedBarangayHealthCenter ||
      user.assignedRuralHealthUnit ||
      "",
    assignedBarangayHealthCenter: bhc?.name || user.assignedBarangayHealthCenter || "",
    assignedRuralHealthUnit: rhu?.name || user.assignedRuralHealthUnit || "",
    facilityId:
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
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(normalizeUser(user)));
}

export function clearAuthSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
}

export async function apiRequest(endpoint, options = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const error = new Error("You are offline. Please reconnect and try again.");
    error.code = "OFFLINE";
    error.isOffline = true;
    throw error;
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

  const token = getAuthToken();
  if (token && options.auth !== false) {
    headers.Authorization = `Bearer ${token}`;
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
    signal: options.signal || controller.signal,
    body:
      options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  }).catch((error) => {
    if (error.name === "AbortError") {
      throw timeoutError;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const offlineError = new Error("You are offline. Please reconnect and try again.");
      offlineError.code = "OFFLINE";
      offlineError.isOffline = true;
      throw offlineError;
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
    const errorMessage =
      payload.message || firstValidationError || "API request failed.";

    if (import.meta.env.DEV) {
      console.debug("API request failed", {
        status: response.status,
        endpoint,
        payload,
      });
    }

    const error = new Error(errorMessage);
    error.status = response.status;
    error.errors = payload.errors || {};
    error.payload = payload;
    throw error;
  }

  return payload;
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
