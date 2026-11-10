import { API_ERROR_MESSAGES, serverErrorMessage } from "./apiErrorMessages";
import { queryClient } from "../lib/queryClient";
import { API_BASE_URL } from "../config/environment";
import { fetchWithTimeout } from "./requestTimeout";
import {
  clearSensitiveSessionState,
  isForcedSessionInvalidation,
} from "../utils/sessionPrivacy";
import { CHANGE_PASSWORD_PATH } from "../utils/passwordChange";
import { formDraftRequestOptions } from "../utils/formDraftRequest";

const TOKEN_KEY = "akay_auth_token";
const USER_KEY = "akay_auth_user";
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS) || 30000;
const SESSION_REQUEST_HEADERS = { "X-AKAY-Session": "1" };

let accessToken = null;
let authenticatedUser = null;
let refreshPromise = null;
let authRecoveryError = null;

export function getAuthRecoveryError() {
  return authRecoveryError;
}

export function subscribeToAuthRecovery(onChange) {
  window.addEventListener("akay:auth-changed", onChange);
  return () => window.removeEventListener("akay:auth-changed", onChange);
}

export function getAuthToken() {
  return accessToken;
}

export function getStoredAuthUser() {
  return authenticatedUser;
}

export function normalizeUser(user = {}) {
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
    // The API's account types (admin, bhc, rhu) are the app's route roles; no mapping is needed.
    role: user.role || "",
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
  if (token && user) authRecoveryError = null;
  if (token) accessToken = token;
  if (user) {
    const normalized = normalizeUser(user);
    const choices = normalized.authorized_facilities || [];
    const key = normalized.working_facility_key || (authenticatedUser?.id === normalized.id ? authenticatedUser?.working_facility_key : null);
    const selected = choices.find(f => f.key === key) || (choices.length === 1 ? choices[0] : null);
    authenticatedUser = selected && normalized.role !== "admin" ? withFacility(normalized, selected) : normalized;
    announceAuthChange();
  }

  removeLegacyPersistedAuth();
}

// Lets permission guards (hooks/useAccess) re-read the in-memory user when it changes.
function announceAuthChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("akay:auth-changed"));
}

function withFacility(user, facility) {
  return { ...user, working_facility_key: facility.key, role: facility.type, permissions: facility.permissions, facility: facility.name, facilityId: facility.id,
    barangayHealthCenterId: facility.type === "bhc" ? facility.id : "", ruralHealthUnitId: facility.type === "rhu" ? facility.id : "",
    navigation: { home: `/${facility.type}/dashboard`, scope: facility.type } };
}

export async function selectWorkingFacility(key) {
  const selected = authenticatedUser?.authorized_facilities?.find(f => f.key === key);
  if (!selected) throw new Error("This facility assignment is unavailable.");
  await clearSensitiveSessionState({ queryClient, reason: "facility-switched", broadcast: false, preserveAuthentication: true });
  authenticatedUser = withFacility(authenticatedUser, selected);
  announceAuthChange();
  return authenticatedUser;
}

export function clearAuthSession() {
  authRecoveryError = null;
  accessToken = null;
  authenticatedUser = null;
  announceAuthChange();
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
  const error = new Error(API_ERROR_MESSAGES.offline);
  error.code = "OFFLINE";
  error.isOffline = true;
  return error;
}

function createTimeoutError() {
  const error = new Error(API_ERROR_MESSAGES.timeout);
  error.code = "TIMEOUT";
  error.isTimeout = true;
  return error;
}

async function sendRequest(endpoint, options = {}) {
  options = formDraftRequestOptions(options, getStoredAuthUser() || {});
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
    if (authenticatedUser?.working_facility_key) headers["X-Working-Facility"] = authenticatedUser.working_facility_key;
  }

  const response = await fetchWithTimeout(
    (signal) =>
      fetch(url, {
        ...options,
        headers,
        cache: options.cache || "no-store",
        credentials: options.credentials || "omit",
        signal,
        body:
          options.body && !(options.body instanceof FormData)
            ? JSON.stringify(options.body)
            : options.body,
      }),
    { signal: options.signal, timeoutMs: REQUEST_TIMEOUT_MS, createTimeoutError },
  ).catch((error) => {
    // Timeouts and the caller's own cancellations pass through untouched.
    if (error.isTimeout || options.signal?.aborted) throw error;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw createOfflineError();
    }

    // The browser's own text ("Failed to fetch") means nothing to a person.
    error.message = API_ERROR_MESSAGES.unreachable;
    error.code ||= "NETWORK_ERROR";
    error.isNetworkError = true;
    throw error;
  });

  if (response.status === 204) return null;

  if (response.ok && options.responseType === "blob") return response.blob();

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(serverErrorMessage(payload));
    error.status = response.status;
    error.code = payload.code || "";
    error.errors = payload.errors || {};
    error.payload = payload;
    if (response.status === 429) {
      error.code = error.code || "RATE_LIMITED";
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfter = Number.parseInt(retryAfterHeader || "", 10);
      if (Number.isFinite(retryAfter) && retryAfter >= 0) {
        error.retryAfter = retryAfter;
      }
    }
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
          // An incomplete response does not prove that the credential was rejected.
          error.code = "SESSION_RESTORE_UNAVAILABLE";
          throw error;
        }

        storeAuthSession({ token: response.token, user: response.user });
        return getStoredAuthUser();
      })
      .catch(async (error) => {
        if (isForcedSessionInvalidation(error?.status, error?.payload)) {
          await invalidateFrontendSession(error);
        } else {
          // Retain credentials and drafts, but gate protected UI until Retry verifies them.
          authRecoveryError = error;
          announceAuthChange();
        }
        throw error;
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

function waitForSessionRefresh(signal) {
  signal?.throwIfAborted();
  const refresh = refreshAuthSession();
  if (!signal) return refresh;

  // One cancelled caller must not cancel the shared refresh for other requests.
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    refresh.then(
      (user) => {
        signal.removeEventListener("abort", onAbort);
        resolve(user);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
    // Refresh may synchronously trigger cancellation before the listener is attached.
    if (signal.aborted) {
      signal.removeEventListener("abort", onAbort);
      onAbort();
    }
  });
}

export async function apiRequest(endpoint, options = {}) {
  options.signal?.throwIfAborted();
  if (options.auth !== false && authRecoveryError) throw authRecoveryError;

  try {
    return await sendRequest(endpoint, options);
  } catch (error) {
    const canRefresh =
      error?.status === 401 &&
      options.auth !== false &&
      options.retryAfterRefresh !== false;

    if (canRefresh) {
      await waitForSessionRefresh(options.signal);
      options.signal?.throwIfAborted();

      // Never repeat a clinical write automatically, even after a successful refresh.
      if (!["GET", "HEAD", "OPTIONS"].includes((options.method || "GET").toUpperCase())) {
        const retryError = new Error(
          "Your session was restored. This request was not retried. Check its status before submitting again.",
          { cause: error },
        );
        retryError.code = "AUTH_RECOVERED_RETRY_REQUIRED";
        throw retryError;
      }

      // Replay has its own normal error handling, with at most one refresh per request.
      return apiRequest(endpoint, { ...options, retryAfterRefresh: false });
    }

    // The account still has a temporary password: every protected call is refused until it is changed.
    if (
      error?.status === 403 &&
      error?.code === "PASSWORD_CHANGE_REQUIRED" &&
      typeof window !== "undefined" &&
      window.location.pathname !== CHANGE_PASSWORD_PATH
    ) {
      window.location.assign(CHANGE_PASSWORD_PATH);
    }

    if (isForcedSessionInvalidation(error?.status, error?.payload)) {
      await invalidateFrontendSession(error);
    }

    throw error;
  }
}

// Changing the password revokes every token, so the response carries a fresh session (like login) and its refresh cookie.
export async function changePassword({ currentPassword, password, passwordConfirmation }) {
  const response = await apiRequest(
    "/auth/change-password",
    sessionRequestOptions({
      method: "POST",
      body: {
        current_password: currentPassword,
        password,
        password_confirmation: passwordConfirmation,
      },
    }),
  );

  storeAuthSession({ token: response.token, user: response.user });
  return getStoredAuthUser();
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
