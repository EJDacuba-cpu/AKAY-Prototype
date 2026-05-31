import { getItem, setItem } from "./storageService";
import { createRoleNotification } from "./notificationService";

const ADMIN_ACCOUNTS_KEY = "akay_admin_accounts";

const seedAccounts = [
  {
    id: "USR-001",
    fullName: "Admin MHO",
    name: "Admin MHO",
    email: "admin@akay.local",
    contactNumber: "09170000001",
    role: "Admin",
    position: "Municipal Health Officer",
    facility: "Municipality of Bulakan",
    status: "Active",
    setupMethod: "Send setup link to email",
  },
  {
    id: "USR-002",
    fullName: "Lorna Reyes",
    name: "Lorna Reyes",
    email: "bhc@akay.local",
    contactNumber: "09170000002",
    role: "BHC",
    position: "Barangay Health Worker",
    facility: "Pitpitan Health Center",
    status: "Active",
    setupMethod: "Send setup link to email",
  },
  {
    id: "USR-003",
    fullName: "Joshua Pio",
    name: "Joshua Pio",
    email: "rhu@akay.local",
    contactNumber: "09170000003",
    role: "RHU",
    position: "RHU Staff",
    facility: "Rural Health Unit Bulakan",
    status: "Active",
    setupMethod: "Send setup link to email",
  },
  {
    id: "USR-004",
    fullName: "Ana Cruz",
    name: "Ana Cruz",
    email: "ana.bhc@akay.local",
    contactNumber: "09170000006",
    role: "BHC",
    position: "BHC Staff",
    facility: "Taliptip Health Center",
    status: "Inactive",
    setupMethod: "Require password reset on first login",
  },
];

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAccount(account = {}) {
  const fullName = account.fullName || account.name || "";
  const { doctorProfile, ...accountWithoutDoctorProfile } = account;
  void doctorProfile;

  return {
    ...accountWithoutDoctorProfile,
    id: account.id || `USR-${Date.now()}`,
    fullName,
    name: fullName,
    status: account.status || "Active",
    facility: account.facility || account.assignedFacility || "",
    setupMethod: account.setupMethod || "Send setup link to email",
  };
}

function isDoctorAccount(account = {}) {
  return account.role === "RHU" && account.position === "Doctor";
}

export function getAdminAccounts() {
  const stored = ensureArray(getItem(ADMIN_ACCOUNTS_KEY, []));
  if (stored.length > 0) {
    return stored.filter((account) => !isDoctorAccount(account)).map(normalizeAccount);
  }

  setItem(ADMIN_ACCOUNTS_KEY, seedAccounts);
  return seedAccounts;
}

export function saveAdminAccounts(accounts) {
  const normalized = ensureArray(accounts)
    .filter((account) => !isDoctorAccount(account))
    .map(normalizeAccount);
  setItem(ADMIN_ACCOUNTS_KEY, normalized);
  return normalized;
}

export function createAdminAccount(accountData) {
  const accounts = getAdminAccounts();
  const nextId = `USR-${String(accounts.length + 1).padStart(3, "0")}`;
  if (accountData.role === "RHU" && accountData.position === "Doctor") {
    throw new Error("Doctors are managed through RHU Doctor Availability.");
  }

  const newAccount = normalizeAccount({
    id: nextId,
    ...accountData,
  });

  const saved = saveAdminAccounts([newAccount, ...accounts])[0];
  createRoleNotification("admin", {
    title: "New account created",
    message: `${saved.fullName || saved.name} was added as ${
      saved.accountRoleLabel || saved.role
    }.`,
    type: "account",
    referenceId: `${saved.id}-created`,
    link: "/admin/users",
    sender: "Admin/MHO",
  });
  return saved;
}

export function updateAdminAccountStatus(id, status) {
  const accounts = getAdminAccounts().map((account) =>
    account.id === id
      ? {
          ...account,
          status,
        }
      : account,
  );
  saveAdminAccounts(accounts);
  const updated = accounts.find((account) => account.id === id) || null;
  if (updated) {
    createRoleNotification("admin", {
      title: "Account status updated",
      message: `${updated.fullName || updated.name} was ${
        status === "Active" ? "activated" : "deactivated"
      }.`,
      type: "account",
      referenceId: `${updated.id}-${status}`,
      link: "/admin/users",
      sender: "Admin/MHO",
    });
  }
  return updated;
}

export function updateAdminAccount(id, updates) {
  const accounts = getAdminAccounts().map((account) => {
    if (account.id !== id) return account;

    if (updates.role === "RHU" && updates.position === "Doctor") {
      return account;
    }

    const next = normalizeAccount({
      ...account,
      ...updates,
      name: updates.fullName || updates.name || account.name,
    });

    return next;
  });

  saveAdminAccounts(accounts);
  return accounts.find((account) => account.id === id) || null;
}

export function sendAdminAccountResetLink(id) {
  const timestamp = new Date().toISOString();
  const accounts = getAdminAccounts().map((account) =>
    account.id === id
      ? {
          ...account,
          setupMethod: "Require password reset on first login",
          lastResetLinkSentAt: timestamp,
        }
      : account,
  );

  saveAdminAccounts(accounts);
  return accounts.find((account) => account.id === id) || null;
}

export function getRhuDoctorAccounts() {
  return [];
}
