/**
 * Central export for all mock data
 * This makes it easy to switch between mock and real API
 */
export { mockPatients } from "./patients";
export { mockHealthRecords } from "./healthRecords";
export { mockReferrals } from "./referrals";
export { mockPatientDetails } from "./patientDetails";
export {
  mockDashboardStats,
  getMedicineAlerts,
  getPatientCategories,
  getRecentHealthRecords,
  getRecentReferrals,
} from "./dashboard";
