import {
  getAllHealthRecords,
  getAllPatients,
  getAllReferrals,
  getAllNotifications,
} from "./localStorageDataService";

const delay = () => new Promise((resolve) => setTimeout(resolve, 300));

function formatMaybeDate(d) {
  try {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    // Keep a human readable format similar to existing mock.
    return dt.toLocaleDateString(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(d ?? "");
  }
}

function normalizeRecentHealthRecords(records, patients) {
  // Shape expected by RecentHealthRecordsTable:
  // { patient, visitType, concern, status, date }
  const patientById = new Map(patients.map((p) => [p.id, p]));

  return (records || [])
    .slice()
    .sort((a, b) => {
      const ad = a?.dateCreated || a?.dateOfVisit || a?.date || a?.createdAt;
      const bd = b?.dateCreated || b?.dateOfVisit || b?.date || b?.createdAt;
      return new Date(bd ?? 0) - new Date(ad ?? 0);
    })
    .slice(0, 10)
    .map((record) => {
      const patient = patientById.get(record.patientId) || null;
      const visitType =
        record.visitType ||
        record.classification ||
        record.patientClassification ||
        record.category ||
        "General Consultation";

      const concern =
        record.concern ||
        record.chiefComplaint ||
        record.diagnosis ||
        record.assessment ||
        "";

      const status =
        record.status || record.followUpStatus || record.needsReferral
          ? "For Referral"
          : "Completed";

      const date = formatMaybeDate(
        record.dateOfVisit ||
          record.date ||
          record.dateCreated ||
          record.createdAt,
      );

      return {
        id: record.id,
        patient: patient?.name || record.patient || "Unknown",
        patientId: record.patientId,
        visitType,
        concern,
        status,
        date,
      };
    });
}

function normalizeRecentReferrals(referrals, patients) {
  // Shape expected by RecentReferralsTable:
  // { patient, visitType?, concern?, status, date, trackingId }
  // The table currently renders: patient, visitType, concern, status, date.
  const patientById = new Map(patients.map((p) => [p.id, p]));

  return (referrals || [])
    .slice()
    .sort((a, b) => new Date(b?.createdAt ?? 0) - new Date(a?.createdAt ?? 0))
    .slice(0, 10)
    .map((referral) => {
      const patient = patientById.get(referral.patientId) || null;
      return {
        id: referral.id,
        trackingId: referral.trackingId || referral.id,
        patient:
          patient?.name ||
          referral.patient ||
          referral.patientName ||
          "Unknown",
        visitType:
          referral.classification ||
          referral.patientClassification ||
          referral.category ||
          "Referral",
        concern:
          referral.chiefComplaint ||
          referral.diagnosis ||
          referral.reasonForReferral ||
          "",
        status: referral.status || "Pending",
        date: formatMaybeDate(
          referral.createdAt || referral.dateOfReferral || referral.date,
        ),
      };
    });
}

function normalizeMedicineAlerts(notifications) {
  // The sidebar expects: { name, status, qty }
  // If notifications is already in that shape, pass through.
  const arr = Array.isArray(notifications) ? notifications : [];
  const normalized = arr
    .map((n) => {
      if (!n) return null;
      if (typeof n === "string") {
        return { name: n, status: "Attention", qty: "" };
      }
      return {
        name: n.name || n.medicine || n.title || "Medicine",
        status: n.status || n.type || "Alert",
        qty: n.qty || n.quantity || "",
      };
    })
    .filter(Boolean);

  // Keep existing UI layout stable: always return an array.
  return normalized.length > 0 ? normalized.slice(0, 5) : [];
}

// Dashboard summary data
export async function getDashboardStats() {
  await delay();

  const patients = getAllPatients();
  const healthRecords = getAllHealthRecords();
  const referrals = getAllReferrals();

  const totalPatients = patients.length;
  const healthRecordsThisWeek = healthRecords.length; // keep simple without time logic

  const pendingReferrals = referrals.filter(
    (r) =>
      r.status === "Pending " ||
      r.status === "Pending" ||
      r.status === "Received",
  ).length;

  const monitoringPatients = healthRecords.filter(
    (r) =>
      (r.status || r.followUpStatus) === "For Monitoring" ||
      r.followUpStatus === "Follow-Up",
  ).length;

  return {
    totalPatients,
    healthRecords: healthRecordsThisWeek,
    pendingReferrals,
    monitoringPatients,
  };
}

// Recent Health Records
export async function getRecentHealthRecords() {
  await delay();
  const patients = getAllPatients();
  const records = getAllHealthRecords();
  return normalizeRecentHealthRecords(records, patients);
}

// Recent Referrals
export async function getRecentReferrals() {
  await delay();
  const patients = getAllPatients();
  const referrals = getAllReferrals();
  return normalizeRecentReferrals(referrals, patients);
}

// Medicine Alerts
export async function getMedicineAlerts() {
  await delay();
  const notifications = getAllNotifications();
  return normalizeMedicineAlerts(notifications);
}
