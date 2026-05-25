/**
 * Mock Dashboard Statistics
 */
export const mockDashboardStats = {
  totalPatients: 128,
  activeRecords: 24,
  pendingReferrals: 12,
  monitoringPatients: 8,
};

export function getMedicineAlerts() {
  return [
    {
      id: "MA-001",
      medicine: "Paracetamol 500mg",
      stock: 5,
      threshold: 20,
      status: "critical",
    },
    {
      id: "MA-002",
      medicine: "Amoxicillin 250mg",
      stock: 12,
      threshold: 30,
      status: "warning",
    },
  ];
}

export function getPatientCategories() {
  return [
    { category: "Pregnant Patient", count: 24 },
    { category: "Senior Citizen", count: 32 },
    { category: "Chronic Disease", count: 18 },
    { category: "General Consultation", count: 34 },
    { category: "Immunization", count: 20 },
  ];
}

export function getRecentHealthRecords(limit = 5) {
  const records = [
    {
      id: "HR-001",
      patientName: "Maria Rosa",
      type: "Prenatal Checkup",
      date: "May 13, 2026",
      provider: "Dr. Santos",
    },
    {
      id: "HR-002",
      patientName: "Juan Reyes",
      type: "Senior Health Check",
      date: "May 13, 2026",
      provider: "Dr. Lopez",
    },
    {
      id: "HR-003",
      patientName: "John Cruz",
      type: "General Consultation",
      date: "May 12, 2026",
      provider: "Dr. Garcia",
    },
    {
      id: "HR-004",
      patientName: "David Perez",
      type: "Vaccination",
      date: "May 12, 2026",
      provider: "Dr. Martinez",
    },
    {
      id: "HR-005",
      patientName: "Antonio Santos",
      type: "Follow-up",
      date: "May 11, 2026",
      provider: "Dr. Fernandez",
    },
  ];

  return records.slice(0, limit);
}

export function getRecentReferrals(limit = 5) {
  const referrals = [
    {
      id: "REF-001",
      patientName: "Maria Rosa",
      facility: "Provincial Hospital",
      reason: "High-Risk Pregnancy",
      date: "May 13, 2026",
      status: "Pending",
    },
    {
      id: "REF-002",
      patientName: "Carmen Lopez",
      facility: "District Hospital",
      reason: "Prenatal Care",
      date: "May 10, 2026",
      status: "Accepted",
    },
    {
      id: "REF-003",
      patientName: "Miguel Torres",
      facility: "Regional Center",
      reason: "Specialist Consultation",
      date: "May 09, 2026",
      status: "Completed",
    },
    {
      id: "REF-004",
      patientName: "Robert Fernandez",
      facility: "Provincial Hospital",
      reason: "Chronic Disease Management",
      date: "May 07, 2026",
      status: "Completed",
    },
    {
      id: "REF-005",
      patientName: "Rosa Garcia",
      facility: "District Hospital",
      reason: "Lab Work",
      date: "May 06, 2026",
      status: "Pending",
    },
  ];

  return referrals.slice(0, limit);
}

export default {
  mockDashboardStats,
  getMedicineAlerts,
  getPatientCategories,
  getRecentHealthRecords,
  getRecentReferrals,
};
