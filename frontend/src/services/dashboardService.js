// services/dashboardService.js

import { mockReferrals } from "../data/mockReferrals";

import { mockHealthRecords } from "../data/mockHealthRecords";

import { mockMedicineAlerts } from "../data/mockMedicineAlerts";

import { mockPatientCategories } from "../data/mockPatientCategories";

import { mockDashboardStats } from "../data/mockDashboardStats";

/* Dashboard Analytics */
export async function getDashboardStats() {
  await new Promise((resolve) => setTimeout(resolve, 300));

  return mockDashboardStats;
}

/* Recent Health Records */
export async function getRecentHealthRecords() {
  await new Promise((resolve) => setTimeout(resolve, 300));

  return mockHealthRecords;
}

/* Recent Referrals */
export async function getRecentReferrals() {
  await new Promise((resolve) => setTimeout(resolve, 300));

  return mockReferrals;
}

/* Medicine Alerts */
export async function getMedicineAlerts() {
  await new Promise((resolve) => setTimeout(resolve, 300));

  return mockMedicineAlerts;
}

/* Patient Categories */
export async function getPatientCategories() {
  await new Promise((resolve) => setTimeout(resolve, 300));

  return mockPatientCategories;
}
