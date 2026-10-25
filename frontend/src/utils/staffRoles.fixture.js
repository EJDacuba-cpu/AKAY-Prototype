/** Shape of GET /staff-roles, mirroring backend StaffRoles, for unit tests only. */
const midwife = ["patients.register", "consultations.encode", "consultations.finalize", "clinical.history", "records.correct", "followups.manage", "referrals.submit", "inventory.view", "items.dispense", "reports.view"];
const rhu = ["patients.register", "clinical.history", "rhu.manage", "rhu.providers.manage", "conditions.confirm", "inventory.view", "reports.view"];
const encoder = ["patients.register", "consultations.encode", "inventory.view"];
export const rolesData = {
  roles: [
    { key: "midwife", label: "Midwife", tier: "bhc", licensed: true, defaults: midwife },
    { key: "bhw", label: "BHW", tier: "bhc", licensed: false, defaults: ["patients.register"] },
    { key: "encoder", label: "Encoder", tier: "bhc", licensed: false, defaults: encoder },
    { key: "nurse", label: "Nurse", tier: "rhu", licensed: true, defaults: rhu },
    { key: "doctor", label: "Doctor", tier: "rhu", licensed: true, defaults: rhu },
  ],
  available: {
    bhc: ["patients.register", "consultations.encode", "consultations.finalize", "clinical.history", "clinical.background.update", "records.correct", "followups.manage", "referrals.submit", "inventory.view", "inventory.manage", "items.dispense", "reports.view"],
    rhu: ["patients.register", "consultations.encode", "consultations.finalize", "clinical.history", "records.correct", "inventory.view", "reports.view", "rhu.manage", "rhu.intake", "rhu.providers.manage", "conditions.confirm", "families.view", "families.manage"],
  },
};
