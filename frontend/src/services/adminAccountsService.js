import { apiRequest, unwrapData, unwrapList } from "./apiClient";

export const ADMIN_ACCOUNTS_UPDATED_EVENT = "akay:admin-accounts-updated";

let accountCache = [];
let loadingPromise = null;

function dispatchUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ADMIN_ACCOUNTS_UPDATED_EVENT));
  }
}

const ACCOUNT_TYPES = {
  admin: { badge: "Admin", label: "Municipal Health Officer", staff: "Municipal Health Officer" },
  bhc: { badge: "BHC", label: "Barangay Health Center", staff: "BHC staff" },
  rhu: { badge: "RHU", label: "Rural Health Unit", staff: "RHU staff" },
};

// Display only; role rules come from GET /staff-roles.
function staffRoleLabel(staffRole) {
  if (!staffRole) return "";
  return staffRole === "bhw" ? "BHW" : staffRole.charAt(0).toUpperCase() + staffRole.slice(1);
}

function normalizeAccount(account = {}) {
  const bhc = account.barangay_health_center || account.barangayHealthCenter || null;
  const rhu = account.rural_health_unit || account.ruralHealthUnit || null;
  const type = ACCOUNT_TYPES[account.role];
  const facility = bhc?.name || rhu?.name || account.facility || "";

  return {
    ...account,
    id: account.id ? String(account.id) : "",
    fullName: account.fullName || account.name || "",
    name: account.name || account.fullName || "",
    role: type?.badge || account.role || "",
    backendRole: account.role,
    accountRole: account.role,
    accountRoleLabel: type?.label || "",
    position: account.position || staffRoleLabel(account.staff_role) || type?.staff || "",
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
