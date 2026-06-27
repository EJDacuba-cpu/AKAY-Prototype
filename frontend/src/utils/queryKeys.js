export const queryKeys = {
  patients: (role = "bhc") => ["patients", role],
  patientDetails: (role = "bhc", patientId) => [
    "patient-details",
    role,
    patientId,
  ],
  healthRecords: (role = "bhc") => ["health-records", role],
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
};
