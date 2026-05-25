/**
 * Dashboard Service - Fetch dashboard statistics and metrics
 */
import apiClient from "./api";
import {
  mockDashboardStats,
  getMedicineAlerts,
  getPatientCategories,
  getRecentHealthRecords,
  getRecentReferrals,
} from "../data/mock";

const MOCK_DELAY = 500;
const delay = () => new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));

/**
 * Get dashboard statistics
 */
export async function getDashboardStats() {
  await delay();
  // Real API: return apiClient.get('/dashboard/stats');
  return mockDashboardStats;
}

/**
 * Get medicine alerts
 */
export async function fetchMedicineAlerts() {
  await delay();
  // Real API: return apiClient.get('/dashboard/medicine-alerts');
  return getMedicineAlerts();
}

/**
 * Get patient categories
 */
export async function fetchPatientCategories() {
  await delay();
  // Real API: return apiClient.get('/dashboard/categories');
  return getPatientCategories();
}

/**
 * Get recent health records
 */
export async function fetchRecentHealthRecords(limit = 5) {
  await delay();
  // Real API: return apiClient.get(`/dashboard/records?limit=${limit}`);
  return getRecentHealthRecords(limit);
}

/**
 * Get recent referrals
 */
export async function fetchRecentReferrals(limit = 5) {
  await delay();
  // Real API: return apiClient.get(`/dashboard/referrals?limit=${limit}`);
  return getRecentReferrals(limit);
}

export default {
  getDashboardStats,
  fetchMedicineAlerts,
  fetchPatientCategories,
  fetchRecentHealthRecords,
  fetchRecentReferrals,
};
