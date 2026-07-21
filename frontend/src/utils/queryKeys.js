export const queryKeys = {
  patients: (role = "bhc") => ["patients", role],
  patientDetails: (role = "bhc", patientId) => [
    "patient-details",
    role,
    patientId,
  ],
  healthRecords: (role = "bhc") => ["health-records", role],
  familyPlanningRecords: (role = "bhc") => ["family-planning-records", role],
  healthRecordDetails: (role = "bhc", recordId) => [
    "health-record-details",
    role,
    recordId,
  ],
  referrals: (role = "bhc") => ["referrals", role],
  followUpTasks: (role = "bhc") => ["follow-up-tasks", role],
  referralDetails: (role = "bhc", referralId) => [
    "referral-details",
    role,
    referralId,
  ],
  incomingReferrals: (role = "rhu") => ["incoming-referrals", role],
  dashboardSummary: (role = "bhc") => ["dashboard-summary", role],
  medicineAvailability: (role = "bhc") => ["medicine-availability", role],
  medicineTransactions: (user = {}, medicineId = "", page) => [
    "medicine-transactions",
    String(user?.id || ""),
    String(user?.backendRole || user?.role || ""),
    String(
      user?.barangayHealthCenterId ||
        user?.ruralHealthUnitId ||
        user?.facilityId ||
        "",
    ),
    String(medicineId || ""),
    ...(page === undefined ? [] : [Number(page) || 1]),
  ],
  adminAccounts: () => ["admin-accounts"],
};
