const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000/api";

const TOKEN_KEY = "akay_auth_token";
const USER_KEY = "akay_auth_user";

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

  const response = await fetch(url, {
    ...options,
    headers,
    body:
      options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.message || "API request failed.");
    error.status = response.status;
    error.errors = payload.errors || {};
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
