// Same order as backend ActionPermissions::ALL. Role rules (defaults, availability) come from GET /staff-roles.
export const ALL_PERMISSIONS = ["patients.register", "consultations.encode", "clinical.history", "clinical.background.update", "consultations.finalize", "records.correct", "followups.manage", "referrals.submit", "inventory.view", "inventory.manage", "items.dispense", "rhu.manage", "rhu.intake", "rhu.providers.manage", "conditions.confirm", "reports.view", "families.view", "families.manage"];

// Mirrors backend/app/Services/ActionPermissions.php. `requires` matches the read/write pairs in EnforceActionPermissions.
export const PERMISSION_GROUPS = [
  { key: "patients", label: "Patients" },
  { key: "families", label: "Households" },
  { key: "consultations", label: "Consultations" },
  { key: "history", label: "Health Records & History" },
  { key: "followups", label: "Follow-ups" },
  { key: "referrals", label: "Referrals" },
  { key: "inventory", label: "Medicines & Health Supplies" },
  { key: "reports", label: "Reports" },
  { key: "rhu", label: "RHU Operations" },
];

export const PERMISSION_CATALOG = {
  "patients.register": { group: "patients", label: "Register patients", note: "Register patients and update identification details at this facility." },
  "families.view": { group: "families", label: "View households", note: "Open household details and member lists at the assigned BHC." },
  "families.manage": { group: "families", label: "Manage households", requires: ["families.view"], note: "Create households and correct household details, family serial numbers, and head relationships." },
  "consultations.encode": { group: "consultations", label: "Encode consultations", note: "Start consultation drafts and submit them for review at this BHC." },
  "consultations.finalize": { group: "consultations", label: "Finalize consultations", requires: ["clinical.history"], note: "Finalize consultation drafts into permanent clinical records. Needs health records access." },
  "clinical.history": { group: "history", label: "View health records & history", note: "Open patient histories, completed records, and related clinical screens." },
  "clinical.background.update": { group: "history", label: "Update patient background", requires: ["clinical.history"], note: "Edit Patient Background (medical, family, lifestyle, obstetric) outside a consultation. BHC only; tick only when needed." },
  "records.correct": { group: "history", label: "Correct finalized records", requires: ["clinical.history"], note: "Add documented corrections to finalized records. Does not unlock free editing of saved history." },
  "followups.manage": { group: "followups", label: "Manage follow-ups", requires: ["clinical.history"], note: "Schedule, reschedule, and close follow-up tasks. Viewing the follow-ups list also needs health records access." },
  "referrals.submit": { group: "referrals", label: "Submit referrals", requires: ["clinical.history"], note: "Submit patient referrals from this BHC to the RHU, including from a finalized consultation." },
  "inventory.view": { group: "inventory", label: "View medicines & supplies", note: "See medicine and supply availability at this BHC. Does not grant stock management." },
  "inventory.manage": { group: "inventory", label: "Manage stock", requires: ["inventory.view"], note: "Add, restock, and adjust medicines and supplies." },
  "items.dispense": { group: "inventory", label: "Dispense medicines", requires: ["inventory.view"], note: "Confirm medicine releases to patients during consultation work. Needs inventory view; does not grant stock management or prescribing." },
  "reports.view": { group: "reports", label: "View & export reports", note: "Open facility reports and export them. Does not grant clinical write access." },
  "rhu.manage": { group: "rhu", label: "Manage RHU referrals", note: "Can receive incoming referrals and send feedback. Does not grant doctor availability management." },
  "rhu.intake": { group: "rhu", label: "RHU intake", note: "Can open the QR Scanner and Incoming Referrals, identify an arrival and mark it Received. Sees only who arrived; clinical details need Health Records." },
  "rhu.providers.manage": { group: "rhu", label: "Manage doctor availability", note: "Can set official doctors Available or Unavailable for this RHU after confirming they are on duty. Does not grant referral management." },
  "conditions.confirm": { group: "rhu", label: "Confirm conditions", note: "Can confirm patient conditions on RHU feedback." },
};

export const LICENSED_PERMISSIONS = ["consultations.finalize", "records.correct", "referrals.submit", "conditions.confirm"];
// Mirrors backend NurseAssignmentPolicy::DUTIES: what an RHU nurse may be given at an assigned BHC.
export const NURSE_ASSIGNMENT_DUTIES = ["patients.register", "consultations.encode", "clinical.history", "clinical.background.update", "consultations.finalize", "records.correct", "followups.manage", "referrals.submit", "inventory.view", "items.dispense", "reports.view", "families.view", "families.manage"];

// Duties an admin ticks one by one: never in role defaults or a suggested bundle.
export const EXPLICIT_ONLY_PERMISSIONS = ["clinical.background.update", "consultations.finalize", "records.correct", "followups.manage", "referrals.submit", "inventory.view", "items.dispense", "reports.view", "families.manage"];

/** Least-privilege starter set for a BHC nurse assignment. Elevated duties stay unticked. */
export const SUGGESTED_NURSE_DUTIES = ["patients.register", "consultations.encode", "clinical.history", "families.view"];

/** The "Apply common BHC clinical set" bundle for a nurse assignment. */
export function suggestedNurseDuties() {
  return SUGGESTED_NURSE_DUTIES.filter((key) => NURSE_ASSIGNMENT_DUTIES.includes(key));
}

export function can(user, permission) {
  return (user?.permissions || []).includes(permission);
}
