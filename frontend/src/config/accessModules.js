// One entry per permission-gated module. `permission` is what the backend's EnforceActionPermissions
// asks for to read it; `skeleton` is the PageSkeletonLoader variant blurred behind a locked page.
export const ACCESS_MODULES = {
  families: { label: "Families", permission: "families.view", skeleton: "table" },
  familiesManage: { label: "Manage Families", permission: "families.manage", skeleton: "form" },
  patients: { label: "Patients", permission: "patients.register", skeleton: "table" },
  patientDirectory: { label: "Patients", permission: "patients.register", skeleton: "table" },
  consultations: { label: "Consultations", permission: "consultations.encode", skeleton: "form" },
  history: { label: "Health Records & History", permission: "clinical.history", skeleton: "health-records" },
  followups: { label: "Follow-up Management", permission: "followups.manage", skeleton: "follow-ups" },
  referrals: { label: "Referral Submission", permission: "referrals.submit", skeleton: "form" },
  inventory: { label: "Medicines & Health Supplies", permission: "inventory.view", skeleton: "medicine" },
  inventoryManage: { label: "Stock Management", permission: "inventory.manage", skeleton: "medicine" },
  dispensing: { label: "Dispensing", permission: "items.dispense", skeleton: "module" },
  reports: { label: "Reports", permission: "reports.view", skeleton: "reports" },
  rhu: { label: "RHU Operations", permission: "rhu.manage", skeleton: "table" },
};

/** Admins keep their existing read access (navigationAllowed treats them the same way). */
export function canAccessModule(user, module) {
  if (user?.role === "admin") return true;
  if (module === "patientDirectory" && user?.role === "bhc" && (user.permissions || []).includes("clinical.history")) return true;
  const permission = ACCESS_MODULES[module]?.permission;
  return Boolean(permission) && (user?.permissions || []).includes(permission);
}
