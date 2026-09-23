export const PERMISSION_PRESETS = {
  clinical: { label: "Clinical Staff", description: "Register, assess, review and finalize consultations.", permissions: ["patients.register", "consultations.encode", "clinical.history", "consultations.finalize", "records.correct", "followups.manage", "referrals.submit", "inventory.view", "reports.view"] },
  encoder: { label: "Encoder", description: "Register patients and prepare current consultations for review.", permissions: ["patients.register", "consultations.encode", "inventory.view"] },
  inventory: { label: "Inventory Staff", description: "Manage medicines and health supplies at assigned facilities.", permissions: ["inventory.view", "inventory.manage"] },
  rhu: { label: "RHU Staff", description: "Receive referrals, manage doctor availability and feedback.", permissions: ["patients.register", "clinical.history", "rhu.manage", "inventory.view", "reports.view"] },
};

export const ALL_PERMISSIONS = [...new Set([...Object.values(PERMISSION_PRESETS).flatMap(p => p.permissions), "items.dispense"])];

export function can(user, permission) {
  return (user?.permissions || []).includes(permission);
}
