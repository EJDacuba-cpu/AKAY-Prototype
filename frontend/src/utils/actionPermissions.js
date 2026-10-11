// Same order as backend ActionPermissions::ALL. Role rules (defaults, availability) come from GET /staff-roles.
export const ALL_PERMISSIONS = ["patients.register", "consultations.encode", "clinical.history", "consultations.finalize", "records.correct", "followups.manage", "referrals.submit", "inventory.view", "inventory.manage", "items.dispense", "rhu.manage", "conditions.confirm", "reports.view"];

// Mirrors backend/app/Services/ActionPermissions.php. `requires` matches the read/write pairs in EnforceActionPermissions.
export const PERMISSION_GROUPS = [
  { key: "patients", label: "Patients" },
  { key: "consultations", label: "Consultations" },
  { key: "history", label: "Health Records & History" },
  { key: "followups", label: "Follow-ups" },
  { key: "referrals", label: "Referrals" },
  { key: "inventory", label: "Medicines & Health Supplies" },
  { key: "reports", label: "Reports" },
  { key: "rhu", label: "RHU Operations" },
];

export const PERMISSION_CATALOG = {
  "patients.register": { group: "patients", label: "Register patients", note: "Can register patients and update their identification details." },
  "consultations.encode": { group: "consultations", label: "Encode consultations", note: "Can start current consultations and submit them for review." },
  "consultations.finalize": { group: "consultations", label: "Review & finalize consultations", requires: ["clinical.history"], note: "Can finalize consultations into permanent clinical records." },
  "clinical.history": { group: "history", label: "View health records & patient history", note: "Can open full patient histories, previous diagnoses and completed records." },
  "records.correct": { group: "history", label: "Correct finalized records", requires: ["clinical.history"], note: "Can add documented corrections to finalized records." },
  "followups.manage": { group: "followups", label: "Manage follow-ups", requires: ["clinical.history"], note: "Can schedule, reschedule and close patient follow-ups." },
  "referrals.submit": { group: "referrals", label: "Submit referrals", requires: ["clinical.history"], note: "Can submit patient referrals to the RHU." },
  "inventory.view": { group: "inventory", label: "View medicines & supplies", note: "Can see medicine and supply availability." },
  "inventory.manage": { group: "inventory", label: "Manage stock", requires: ["inventory.view"], note: "Can add, restock and adjust medicines and supplies." },
  "items.dispense": { group: "inventory", label: "Confirm dispensing", note: "Can confirm medicine releases to patients. Dispensing does not grant prescribing authority." },
  "reports.view": { group: "reports", label: "View reports", note: "Can view and export facility reports." },
  "rhu.manage": { group: "rhu", label: "RHU referrals & doctor availability", note: "Can receive referrals, manage doctor availability and send feedback." },
  "conditions.confirm": { group: "rhu", label: "Confirm conditions", note: "Can confirm patient conditions on RHU feedback." },
};

export const LICENSED_PERMISSIONS = ["consultations.finalize", "records.correct", "referrals.submit", "conditions.confirm"];
// Mirrors backend NurseAssignmentPolicy::DUTIES: what an RHU nurse may be given at an assigned BHC.
export const NURSE_ASSIGNMENT_DUTIES = ["patients.register", "consultations.encode", "clinical.history", "consultations.finalize", "records.correct", "followups.manage", "referrals.submit", "inventory.view", "items.dispense", "reports.view"];

export function can(user, permission) {
  return (user?.permissions || []).includes(permission);
}
