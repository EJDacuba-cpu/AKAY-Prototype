import { getHealthRecords } from "./healthRecordService";
import { getBhcPatients } from "./patientService";
import { getReferrals } from "./referrals";
import { getAllNotifications } from "./notificationService";

function formatMaybeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function normalizeRecentHealthRecords(records, patients) {
  const patientById = new Map(patients.map((patient) => [String(patient.id), patient]));

  return records
    .slice()
    .sort((a, b) => new Date(b.createdAt || b.dateRecorded || 0) - new Date(a.createdAt || a.dateRecorded || 0))
    .slice(0, 10)
    .map((record) => {
      const patient = patientById.get(String(record.patientId)) || record.patient;
      return {
        id: record.id,
        patient: patient?.name || record.patientName || "Unknown",
        patientId: record.patientId,
        visitType: record.category || "General Consultation",
        concern: record.chiefComplaint || record.diagnosis || "",
        status: record.status || "Completed",
        date: formatMaybeDate(record.dateOfVisit || record.createdAt),
      };
    });
}

function normalizeRecentReferrals(referrals) {
  return referrals
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 10)
    .map((referral) => ({
      id: referral.id,
      trackingId: referral.trackingId,
      patient: referral.patientName || "Unknown",
      visitType: referral.category || referral.referralCategory || "Referral",
      concern: referral.chiefComplaint || referral.reasonForReferral || "",
      status: referral.status || "Pending",
      date: formatMaybeDate(referral.createdAt || referral.referralDateTime),
    }));
}

function normalizeMedicineAlerts(notifications) {
  return notifications
    .filter((notification) => String(notification.type || "").includes("medicine"))
    .slice(0, 5)
    .map((notification) => ({
      name: notification.title || "Medicine",
      status: notification.message || "Alert",
      qty: "",
    }));
}

export async function getDashboardStats() {
  const [patients, healthRecords, referrals] = await Promise.all([
    getBhcPatients(),
    getHealthRecords(),
    getReferrals(),
  ]);

  return {
    totalPatients: patients.length,
    healthRecords: healthRecords.length,
    pendingReferrals: referrals.filter((referral) =>
      ["Pending", "Received"].includes(referral.status),
    ).length,
    monitoringPatients: healthRecords.filter((record) =>
      ["For Monitoring", "Follow-up Required"].includes(record.status),
    ).length,
  };
}

export async function getRecentHealthRecords() {
  const [records, patients] = await Promise.all([getHealthRecords(), getBhcPatients()]);
  return normalizeRecentHealthRecords(records, patients);
}

export async function getRecentReferrals() {
  return normalizeRecentReferrals(await getReferrals());
}

export async function getMedicineAlerts() {
  return normalizeMedicineAlerts(getAllNotifications());
}
