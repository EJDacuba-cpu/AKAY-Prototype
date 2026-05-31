import {
  getAllHealthRecords,
  getAllReferrals,
} from "./localStorageDataService";
import { getItem, setItem } from "./storageService";

const STORAGE_KEY = "akay_rhu_patient_volume";
const UPDATED_KEY = "akay_rhu_patient_volume_updated";

export function getRhuPatientVolume(defaultVolume = "Normal") {
  return getItem(STORAGE_KEY, defaultVolume);
}

export function getRhuPatientVolumeUpdatedTime(defaultValue = "Not updated yet") {
  return getItem(UPDATED_KEY, defaultValue);
}

export function saveRhuPatientVolume(volume, updatedTime) {
  setItem(STORAGE_KEY, volume);
  setItem(UPDATED_KEY, updatedTime);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.includes("monitor")) return "For Monitoring";
  if (raw.includes("received")) return "Received";
  if (raw.includes("complete")) return "Completed";
  if (raw.includes("no-show") || raw.includes("no show")) return "No-Show";
  if (raw.includes("pending")) return "Pending";
  return String(value || "Pending").trim();
}

function normalizePriority(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isToday(value, now = new Date()) {
  const parsed = parseDate(value);
  if (!parsed) return false;

  return (
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  );
}

function getReferralDate(referral = {}) {
  return (
    referral.createdAt ||
    referral.created_at ||
    referral.dateOfReferral ||
    referral.referralDate ||
    referral.dateSubmitted ||
    referral.submittedAt ||
    referral.date
  );
}

function getReceivedDate(referral = {}) {
  return (
    referral.receivedAt ||
    referral.received_at ||
    referral.checkedInAt ||
    referral.checked_in_at ||
    referral.updatedAt ||
    referral.updated_at ||
    getReferralDate(referral)
  );
}

function isHighPriority(referral = {}) {
  const priority = normalizePriority(
    referral.priority ||
      referral.urgency ||
      referral.urgencyLevel ||
      referral.referralPriority,
  );

  return ["high", "urgent", "emergency"].includes(priority);
}

function isWalkInPatient(patient = {}) {
  const registrationSource = String(patient.registrationSource || "");
  const sourceRole = String(patient.sourceRole || "").toUpperCase();
  const source = String(patient.source || patient.patientSource || "");

  if (registrationSource === "RHU_REFERRAL_RECEIVED") return false;
  if (registrationSource === "RHU_REGISTRATION") return true;
  if (/walk[-\s]?in/i.test(source)) return true;

  return sourceRole === "RHU" && !patient.linkedTrackingId;
}

function getPatientRegistrationDate(patient = {}) {
  return (
    patient.dateRegistered ||
    patient.createdAt ||
    patient.created_at ||
    patient.registeredAt ||
    patient.lastVisit
  );
}

function isMonitoringRecord(record = {}) {
  return [
    record.monitoringStatus,
    record.monitoring_status,
    record.followUpStatus,
    record.follow_up_status,
    record.status,
    record.patientCondition,
  ].some((value) => normalizeStatus(value) === "For Monitoring");
}

export function calculateRhuVolume({
  incomingReferralsToday = 0,
  highPriorityReferrals = 0,
  walkInPatientsToday = 0,
  patientsForMonitoring = 0,
} = {}) {
  const workloadScore =
    Number(incomingReferralsToday || 0) * 1 +
    Number(walkInPatientsToday || 0) * 1 +
    Number(patientsForMonitoring || 0) * 0.5 +
    Number(highPriorityReferrals || 0) * 2;

  if (workloadScore <= 10) {
    return { status: "Low", workloadScore, percent: 18 };
  }

  if (workloadScore <= 25) {
    return { status: "Normal", workloadScore, percent: 48 };
  }

  return { status: "High", workloadScore, percent: 82 };
}

export function getRhuWorkloadCounts(now = new Date()) {
  const referrals = ensureArray(getAllReferrals());
  const healthRecords = ensureArray(getAllHealthRecords());
  const rhuPatients = ensureArray(getItem("akay_rhu_patients", []));

  const referralsToday = referrals.filter((referral) =>
    isToday(getReferralDate(referral), now),
  );
  const activeMonitoringRecords = healthRecords.filter(isMonitoringRecord);
  const monitoringReferrals = referrals.filter(
    (referral) => normalizeStatus(referral.status) === "For Monitoring",
  );

  const walkInPatientsToday = rhuPatients.filter(
    (patient) =>
      isWalkInPatient(patient) &&
      isToday(getPatientRegistrationDate(patient), now),
  ).length;

  return {
    incomingReferralsToday: referralsToday.length,
    highPriorityReferrals: referralsToday.filter(isHighPriority).length,
    walkInPatientsToday,
    patientsForMonitoring:
      monitoringReferrals.length + activeMonitoringRecords.length,
    pendingReferrals: referrals.filter(
      (referral) => normalizeStatus(referral.status) === "Pending",
    ).length,
    receivedReferralsToday: referrals.filter(
      (referral) =>
        normalizeStatus(referral.status) === "Received" &&
        isToday(getReceivedDate(referral), now),
    ).length,
    activeMonitoringRecords: activeMonitoringRecords.length,
  };
}

export function getRhuVolumeSnapshot(now = new Date()) {
  const counts = getRhuWorkloadCounts(now);
  const volume = calculateRhuVolume(counts);

  return {
    ...volume,
    counts,
    updatedLabel: now.toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}
