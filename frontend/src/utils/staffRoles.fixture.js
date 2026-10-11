/** Shape of GET /staff-roles, mirroring backend StaffRoles, for unit tests only. */
const midwife = ["patients.register", "consultations.encode", "consultations.finalize", "clinical.history", "records.correct", "followups.manage", "referrals.submit", "inventory.view", "items.dispense", "reports.view"];
const rhu = ["patients.register", "clinical.history", "rhu.manage", "conditions.confirm", "inventory.view", "reports.view"];
const encoder = ["patients.register", "consultations.encode", "inventory.view"];
export const rolesData = {
  roles: [
    { key: "midwife", label: "Midwife", tier: "bhw", licensed: true, defaults: midwife },
    { key: "bhw", label: "BHW", tier: "bhw", licensed: false, defaults: ["patients.register"] },
    { key: "encoder", label: "Encoder", tier: "bhw", licensed: false, defaults: encoder },
    { key: "nurse", label: "Nurse", tier: "rhu_staff", licensed: true, defaults: rhu },
    { key: "doctor", label: "Doctor", tier: "rhu_staff", licensed: true, defaults: rhu },
  ],
  available: {
    bhw: ["patients.register", "consultations.encode", "consultations.finalize", "clinical.history", "records.correct", "followups.manage", "referrals.submit", "inventory.view", "inventory.manage", "items.dispense", "reports.view"],
    rhu_staff: ["patients.register", "clinical.history", "inventory.view", "reports.view", "rhu.manage", "conditions.confirm"],
  },
};
