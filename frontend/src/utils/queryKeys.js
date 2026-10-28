import { getFacilityCalendarDate } from "./medicineInventoryStatus.js";
export const queryKeys = {
  // The RHU Today's Queue.
  rhuVisits: () => ["rhu-visits"],
  patients: (role = "bhc") => ["patients", role],
  // Under patients(role), so a registration's invalidation refreshes it too.
  household: (role = "bhc", serial) => ["patients", role, "household", serial],
  patientDetails: (role = "bhc", patientId) => [
    "patient-details",
    role,
    patientId,
  ],
  healthRecords: (role = "bhc") => ["health-records", role],
  // In-memory UI state, separate from refetchable clinical queries.
  patientRecordView: (role = "bhc", patientId) => ["patient-record-view", role, patientId],
  familyPlanningRecords: (role = "bhc") => ["family-planning-records", role],
  healthRecordDetails: (role = "bhc", recordId) => [
    "health-record-details",
    role,
    recordId,
  ],
  healthRecordData: (role = "bhc", recordId) => [
    "health-record-data",
    role,
    recordId,
  ],
  referrals: (role = "bhc") => ["referrals", role],
  followUpTasks: (role = "bhc") => ["follow-up-tasks", role],
  followUpTasksCalendar: (role = "bhc", start, end) => [
    "follow-up-tasks-calendar",
    role,
    start,
    end,
  ],
  followUpTaskDetails: (role = "bhc", taskId) => [
    "follow-up-task-details",
    role,
    taskId,
  ],
  referralDetails: (role = "bhc", referralId) => [
    "referral-details",
    role,
    referralId,
  ],
  incomingReferrals: (role = "rhu") => ["incoming-referrals", role],
  dashboardSummary: (role = "bhc") => ["dashboard-summary", role],
  adminDashboard: (period) => ["admin-dashboard", period],
  medicineAvailability: (role = "bhc", user = {}) => ["medicine-availability", role,
    String(user?.id || ""),
    String(role === "bhc" ? (user?.barangayHealthCenterId || user?.barangay_health_center_id || user?.bhcId || user?.facilityId || "") : (user?.ruralHealthUnitId || user?.rural_health_unit_id || user?.rhuId || user?.facilityId || "")),
    getFacilityCalendarDate()],
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
  adminAccount: (id) => ["admin-accounts", String(id)],
  adminFacilities: () => ["admin-facilities"],
  staffRoles: () => ["staff-roles"],
  providers: () => ["rhu-providers"],
  providerAvailability: () => ["rhu-provider-availability"],
  providerUnavailability: (providerId, from, to) => [
    "rhu-provider-unavailability",
    String(providerId || ""),
    from || "",
    to || "",
  ],
  referralHolds: () => ["referral-holds"],
  clinicalRegistry: () => ["clinical-registry"],
  careOverview: (patientId) => ["care-overview", String(patientId)],
  patientConditions: (patientId) => ["patient-conditions", String(patientId)],
  patientBackgroundHistory: (patientId) => ["patient-background-history", String(patientId)],
};
