import { getItem, setItem } from "./storageService";

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
    fullName: "Dr. Maria Santos",
    name: "Dr. Maria Santos",
    email: "maria.santos@akay.local",
    contactNumber: "09170000004",
    role: "RHU",
    position: "Doctor",
    facility: "Rural Health Unit Bulakan",
    status: "Active",
    setupMethod: "Send setup link to email",
    doctorProfile: {
      doctorId: "DOC-001",
      userId: "USR-004",
      doctorType: "General Practitioner",
      defaultSchedule: "Monday, 8:00 AM - 12:00 PM",
      room: "RHU Consultation Room 1",
      profileStatus: "Active",
    },
  },
  {
    id: "USR-005",
    fullName: "Dr. Jose Cruz",
    name: "Dr. Jose Cruz",
    email: "jose.cruz@akay.local",
    contactNumber: "09170000005",
    role: "RHU",
    position: "Doctor",
    facility: "Rural Health Unit Bulakan",
    status: "Active",
    setupMethod: "Send setup link to email",
    doctorProfile: {
      doctorId: "DOC-002",
      userId: "USR-005",
      doctorType: "General Practitioner",
      defaultSchedule: "Monday, 1:00 PM - 5:00 PM",
      room: "RHU Consultation Room 2",
      profileStatus: "Active",
    },
  },
  {
    id: "USR-006",
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
  return {
    ...account,
    id: account.id || `USR-${Date.now()}`,
    fullName,
    name: fullName,
    status: account.status || "Active",
    facility: account.facility || account.assignedFacility || "",
    setupMethod: account.setupMethod || "Send setup link to email",
  };
}

export function getAdminAccounts() {
  const stored = ensureArray(getItem(ADMIN_ACCOUNTS_KEY, []));
  if (stored.length > 0) {
    return stored.map(normalizeAccount);
  }

  setItem(ADMIN_ACCOUNTS_KEY, seedAccounts);
  return seedAccounts;
}

export function saveAdminAccounts(accounts) {
  const normalized = ensureArray(accounts).map(normalizeAccount);
  setItem(ADMIN_ACCOUNTS_KEY, normalized);
  return normalized;
}

export function createAdminAccount(accountData) {
  const accounts = getAdminAccounts();
  const nextId = `USR-${String(accounts.length + 1).padStart(3, "0")}`;
  const isDoctor =
    accountData.role === "RHU" && accountData.position === "Doctor";

  const newAccount = normalizeAccount({
    id: nextId,
    ...accountData,
    doctorProfile: isDoctor
      ? {
          doctorId:
            accountData.doctorProfile?.doctorId ||
            `DOC-${String(
              accounts.filter(
                (account) =>
                  account.role === "RHU" && account.position === "Doctor",
              ).length + 1,
            ).padStart(3, "0")}`,
          userId: nextId,
          doctorType: "General Practitioner",
          defaultSchedule: accountData.doctorProfile?.defaultSchedule || "",
          room: accountData.doctorProfile?.room || "",
          profileStatus:
            accountData.doctorProfile?.profileStatus ||
            accountData.status ||
            "Active",
        }
      : undefined,
  });

  return saveAdminAccounts([newAccount, ...accounts])[0];
}

export function updateAdminAccountStatus(id, status) {
  const accounts = getAdminAccounts().map((account) =>
    account.id === id
      ? {
          ...account,
          status,
          doctorProfile: account.doctorProfile
            ? { ...account.doctorProfile, profileStatus: status }
            : account.doctorProfile,
        }
      : account,
  );
  saveAdminAccounts(accounts);
  return accounts.find((account) => account.id === id) || null;
}

export function updateAdminAccount(id, updates) {
  const accounts = getAdminAccounts().map((account) => {
    if (account.id !== id) return account;

    const isDoctor = updates.role === "RHU" && updates.position === "Doctor";
    const next = normalizeAccount({
      ...account,
      ...updates,
      name: updates.fullName || updates.name || account.name,
      doctorProfile: isDoctor
        ? {
            doctorId:
              account.doctorProfile?.doctorId ||
              updates.doctorProfile?.doctorId ||
              `DOC-${String(
                getAdminAccounts().filter(
                  (item) => item.role === "RHU" && item.position === "Doctor",
                ).length + 1,
              ).padStart(3, "0")}`,
            userId: id,
            doctorType: "General Practitioner",
            defaultSchedule: updates.doctorProfile?.defaultSchedule || "",
            room: updates.doctorProfile?.room || "",
            profileStatus:
              updates.doctorProfile?.profileStatus || updates.status || "Active",
          }
        : undefined,
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
  return getAdminAccounts().filter(
    (account) => account.role === "RHU" && account.position === "Doctor",
  );
}
