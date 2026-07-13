import { apiRequest, mapRoleForBackend, unwrapData, unwrapList } from "./apiClient";

export const ADMIN_ACCOUNTS_UPDATED_EVENT = "akay:admin-accounts-updated";

let accountCache = [];
let loadingPromise = null;

function dispatchUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ADMIN_ACCOUNTS_UPDATED_EVENT));
  }
}

function frontendRole(role) {
  if (role === "admin") return "Admin";
  if (role === "bhw") return "BHC";
  if (role === "rhu_staff") return "RHU";
  return role || "";
}

function normalizeAccount(account = {}) {
  const bhc = account.barangay_health_center || account.barangayHealthCenter || null;
  const rhu = account.rural_health_unit || account.ruralHealthUnit || null;
  const role = frontendRole(account.role);
  const facility = bhc?.name || rhu?.name || account.facility || "";

  return {
    ...account,
    id: account.id ? String(account.id) : "",
    fullName: account.fullName || account.name || "",
    name: account.name || account.fullName || "",
    role,
    backendRole: account.role,
    accountRole:
      account.role === "bhw"
        ? "bhc_worker"
        : account.role === "rhu_staff"
          ? "rhu_staff"
          : "admin",
    accountRoleLabel:
      account.role === "bhw"
        ? "Barangay Health Center Worker"
        : account.role === "rhu_staff"
          ? "Rural Health Unit Staff"
          : "MHO / Admin",
    position:
      account.position ||
      (account.role === "bhw"
        ? "Barangay Health Worker"
        : account.role === "rhu_staff"
          ? "RHU Staff"
          : "Municipal Health Officer"),
    facility,
    bhcFacility: bhc?.name || "",
    rhuFacility: rhu?.name || "",
    assignedBarangayHealthCenter: bhc?.name || "",
    assignedRuralHealthUnit: rhu?.name || "",
    barangayHealthCenterId:
      account.barangay_health_center_id || account.barangayHealthCenterId || bhc?.id || "",
    ruralHealthUnitId:
      account.rural_health_unit_id || account.ruralHealthUnitId || rhu?.id || "",
    status:
      String(account.status || "active").toLowerCase() === "active"
        ? "Active"
        : "Inactive",
  };
}

function toBackendPayload(account = {}) {
  const role = mapRoleForBackend(account.accountRole || account.role);

  return {
    name: account.fullName || account.name,
    email: account.email,
    password: account.password || undefined,
    role,
    status:
      String(account.status || "Active").toLowerCase() === "active"
        ? "active"
        : "inactive",
    barangay_health_center_id: account.barangayHealthCenterId || account.bhcId || null,
    rural_health_unit_id: account.ruralHealthUnitId || account.rhuId || null,
  };
}

export function getAdminAccounts() {
  if (!loadingPromise) refreshAdminAccounts();
  return accountCache;
}

export async function refreshAdminAccounts() {
  loadingPromise = apiRequest("/users")
    .then((response) => {
      accountCache = unwrapList(response).map(normalizeAccount);
      dispatchUpdate();
      return accountCache;
    })
    .catch(() => {
      accountCache = [];
      dispatchUpdate();
      return accountCache;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

export async function loadAdminAccounts() {
  const response = await apiRequest("/users");
  accountCache = unwrapList(response).map(normalizeAccount);
  dispatchUpdate();
  return accountCache;
}

export async function saveAdminAccounts() {
  return refreshAdminAccounts();
}

export async function createAdminAccount(accountData) {
  const response = await apiRequest("/users", {
    method: "POST",
    body: toBackendPayload(accountData),
  });
  const created = normalizeAccount(unwrapData(response));
  accountCache = [created, ...accountCache.filter((account) => account.id !== created.id)];
  dispatchUpdate();
  return created;
}

export async function updateAdminAccountStatus(id, status) {
  const response = await apiRequest(`/users/${id}`, {
    method: "PATCH",
    body: {
      status: String(status).toLowerCase() === "active" ? "active" : "inactive",
    },
  });
  const updated = normalizeAccount(unwrapData(response));
  accountCache = accountCache.map((account) => (account.id === String(id) ? updated : account));
  dispatchUpdate();
  return updated;
}

export async function updateAdminAccount(id, updates) {
  const response = await apiRequest(`/users/${id}`, {
    method: "PATCH",
    body: toBackendPayload(updates),
  });
  const updated = normalizeAccount(unwrapData(response));
  accountCache = accountCache.map((account) => (account.id === String(id) ? updated : account));
  dispatchUpdate();
  return updated;
}

export async function sendAdminAccountResetLink(id) {
  const account = accountCache.find((item) => item.id === String(id));
  if (!account?.email) return null;

  await apiRequest("/auth/forgot-password", {
    method: "POST",
    body: { email: account.email },
  });

  return account;
}

export function getRhuDoctorAccounts() {
  return accountCache.filter((account) => account.role === "RHU" && account.position === "Doctor");
}
