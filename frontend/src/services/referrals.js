import { getAllReferrals, setAllReferrals } from "./localStorageDataService";
import {
  createFacilityNotification,
  normalizeFacilityId,
} from "./notificationService";

const delay = () => new Promise((resolve) => setTimeout(resolve, 300));

const ACTIVE_REFERRAL_STATUSES = ["Pending", "Received", "For Monitoring"];

const STATUS_ALIASES = {
  pending: "Pending",
  received: "Received",
  monitoring: "For Monitoring",
  "for monitoring": "For Monitoring",
  "under assessment": "For Monitoring",
  completed: "Completed",
  "no show": "No-Show",
  "no-show": "No-Show",
  noshow: "No-Show",
};

export function normalizeReferralStatus(status) {
  const raw = String(status || "Pending").trim();
  return STATUS_ALIASES[raw.toLowerCase()] || raw;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeContact(value) {
  return String(value || "").replace(/\D/g, "");
}

function getPatientName(patient = {}) {
  return (
    patient.name ||
    patient.patientName ||
    [patient.firstName, patient.middleName, patient.lastName]
      .filter(Boolean)
      .join(" ")
  );
}

function getReferralPatientName(referral = {}) {
  return (
    referral.patientName ||
    referral.patient ||
    getPatientName(referral.patient || {})
  );
}

function getPatientContact(patient = {}) {
  return patient.contactNumber || patient.contact || patient.phone || "";
}

function getReferralContact(referral = {}) {
  return (
    referral.contactNumber ||
    referral.contact ||
    referral.patientContact ||
    getPatientContact(referral.patient || {})
  );
}

function isReferralForPatient(referral = {}, patient = {}) {
  const patientIds = [
    patient.id,
    patient.patientId,
    patient._id,
  ].filter(Boolean);

  const referralIds = [
    referral.patientId,
    referral.patient?.id,
    referral.patient?.patientId,
    referral.patient?._id,
  ].filter(Boolean);

  if (
    patientIds.length > 0 &&
    referralIds.some((referralId) => patientIds.includes(referralId))
  ) {
    return true;
  }

  const patientName = normalizeText(getPatientName(patient));
  const referralName = normalizeText(getReferralPatientName(referral));
  if (!patientName || !referralName || patientName !== referralName) {
    return false;
  }

  const patientContact = normalizeContact(getPatientContact(patient));
  const referralContact = normalizeContact(getReferralContact(referral));

  if (patientContact && referralContact) {
    return patientContact === referralContact;
  }

  return true;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getNoShowCutoff(referral) {
  const deadline = parseDate(referral.referralDeadline);
  if (deadline) return deadline;

  const referralDay = parseDate(
    referral.preferredVisitDate ||
      referral.dateOfReferral ||
      referral.referralDate ||
      referral.dateSubmitted ||
      referral.date ||
      referral.createdAt,
  );

  if (!referralDay) return null;

  referralDay.setHours(23, 59, 59, 999);
  return referralDay;
}

function getReferralKey(referral = {}) {
  return referral.trackingId || referral.id || "";
}

function isRhuFacility(value = "") {
  return /rhu|rural health unit/i.test(String(value));
}

function cleanBarangayName(value = "") {
  return String(value)
    .replace(/^barangay\s+/i, "")
    .trim();
}

function getReferringHci(referral = {}) {
  const candidates = [
    referral.referringHealthCenter,
    referral.referringBHC,
    referral.bhcName,
    referral.sourceFacility,
    referral.referringFacility,
    referral.bhc,
    referral.referringHci,
  ].filter(Boolean);

  const valid = candidates.find((value) => !isRhuFacility(value));
  if (valid) return valid;

  const barangay =
    referral.referringBarangay ||
    referral.patientBarangay ||
    referral.barangay;

  return barangay
    ? `Barangay ${cleanBarangayName(barangay)} Health Center`
    : "Barangay Health Center";
}

function getReferralPatientLabel(referral = {}) {
  return getReferralPatientName(referral) || "the patient";
}

function getReferralBhcFacilityId(referral = {}) {
  return normalizeFacilityId(getReferringHci(referral), "bhc");
}

function notifyRhuNewReferral(referral = {}) {
  const urgency = String(
    referral.urgency || referral.urgencyLevel || referral.priority || "",
  ).toLowerCase();
  const urgent = urgency === "urgent" || urgency === "emergency";
  const trackingId = referral.trackingId || referral.id;
  const bhcName = getReferringHci(referral);
  const patientName = getReferralPatientLabel(referral);

  createFacilityNotification("rhu", "rhu-bulakan", {
    title: urgent ? "Urgent referral received" : "New referral received",
    message: urgent
      ? `Urgent referral ${trackingId} was submitted by ${bhcName} for ${patientName}.`
      : `${bhcName} submitted a referral for ${patientName}.`,
    type: "referral",
    referenceId: trackingId,
    link: `/rhu/referrals/${trackingId}`,
    sender: bhcName,
    patientName,
  });
}

function notifyBhcReferralStatus(referral = {}, status) {
  const trackingId = referral.trackingId || referral.id;
  const patientName = getReferralPatientLabel(referral);
  const facilityId = getReferralBhcFacilityId(referral);
  const statusCopy = {
    Received: {
      title: "Referral received by RHU",
      message: `Referral ${trackingId} for ${patientName} has been received by RHU.`,
    },
    "No-Show": {
      title: "Patient marked as No-Show",
      message: `Referral ${trackingId} for ${patientName} was marked No-Show by RHU.`,
    },
    "For Monitoring": {
      title: "Patient under RHU monitoring",
      message: `Referral ${trackingId} is currently being monitored at RHU.`,
    },
  };
  const copy = statusCopy[status];
  if (!copy || !trackingId) return;

  createFacilityNotification("bhc", facilityId, {
    ...copy,
    type: "status",
    referenceId: `${trackingId}-${status}`,
    link: `/bhc/referrals/${trackingId}`,
    sender: "RHU Staff",
    patientName,
    status,
  });
}

function notifyBhcReturnSlip(referral = {}) {
  const trackingId = referral.trackingId || referral.id;
  if (!trackingId) return;

  createFacilityNotification("bhc", getReferralBhcFacilityId(referral), {
    title: "RHU feedback available",
    message: `Return slip is now available for referral ${trackingId}.`,
    type: "return-slip",
    referenceId: `${trackingId}-Completed`,
    link: `/bhc/referrals/${trackingId}`,
    sender: "RHU Staff",
    patientName: getReferralPatientLabel(referral),
  });
}

function normalizeReferral(referral = {}) {
  return {
    ...referral,
    status: normalizeReferralStatus(referral.status),
    statusHistory: Array.isArray(referral.statusHistory)
      ? referral.statusHistory
      : [],
  };
}

function normalizeReferrals(referrals) {
  const map = new Map();

  for (const referral of Array.isArray(referrals) ? referrals : []) {
    const normalized = normalizeReferral(referral);
    const key = getReferralKey(normalized);
    if (!key) continue;
    map.set(key, { ...(map.get(key) || {}), ...normalized });
  }

  return [...map.values()];
}

export function saveReferrals(referrals) {
  const normalized = normalizeReferrals(referrals);
  setAllReferrals(normalized);
  return normalized;
}

function appendStatusHistory(referral, status, extra = {}) {
  const nextStatus = normalizeReferralStatus(status);
  return [
    ...(Array.isArray(referral?.statusHistory) ? referral.statusHistory : []),
    {
      status: nextStatus,
      timestamp: extra.timestamp || new Date().toISOString(),
      ...extra,
    },
  ];
}

function findReferralByIdOrTrackingId(referrals, id) {
  return referrals.find(
    (referral) => referral.id === id || referral.trackingId === id,
  );
}

export async function getReferrals() {
  await delay();
  const referrals = normalizeReferrals(getAllReferrals());
  saveReferrals(referrals);
  return referrals;
}

export async function getReferralById(referralId) {
  await delay();
  const referrals = normalizeReferrals(getAllReferrals());
  return findReferralByIdOrTrackingId(referrals, referralId) || null;
}

export async function getReferralByTrackingId(trackingId) {
  await delay();
  const referrals = normalizeReferrals(getAllReferrals());
  return findReferralByIdOrTrackingId(referrals, trackingId) || null;
}

export async function getReferralsByPatient(patient) {
  await delay();
  const referrals = normalizeReferrals(getAllReferrals());
  const patientInput =
    typeof patient === "string" ? { id: patient, patientId: patient } : patient;

  return referrals.filter((referral) =>
    isReferralForPatient(referral, patientInput || {}),
  );
}

export async function hasActiveReferralForPatient(patient) {
  const referrals = await getReferralsByPatient(patient);
  return referrals.some((referral) =>
    ACTIVE_REFERRAL_STATUSES.includes(normalizeReferralStatus(referral.status)),
  );
}

export async function getReferralByHealthRecordId(recordId) {
  await delay();
  if (!recordId) return null;

  const referrals = normalizeReferrals(getAllReferrals());
  return (
    referrals.find((referral) =>
      [
        referral.healthRecordId,
        referral.recordId,
        referral.sourceRecordId,
        referral.consultationRecordId,
      ]
        .filter(Boolean)
        .includes(recordId),
    ) || null
  );
}

export async function createReferral(referralData) {
  await delay();

  const referrals = normalizeReferrals(getAllReferrals());
  const sourceRecordIds = [
    referralData?.healthRecordId,
    referralData?.recordId,
    referralData?.sourceRecordId,
    referralData?.consultationRecordId,
  ].filter(Boolean);

  const existingByRecord =
    sourceRecordIds.length > 0
      ? referrals.find((referral) =>
          [
            referral.healthRecordId,
            referral.recordId,
            referral.sourceRecordId,
            referral.consultationRecordId,
          ]
            .filter(Boolean)
            .some((recordId) => sourceRecordIds.includes(recordId)),
        )
      : null;

  if (existingByRecord) {
    return existingByRecord;
  }

  const now = new Date();
  const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const trackingId =
    referralData?.trackingId || `AKY-${Date.now().toString().slice(-6)}`;

  const existingByTrackingId = referrals.find(
    (referral) => referral.trackingId === trackingId,
  );
  if (existingByTrackingId) {
    return existingByTrackingId;
  }

  const newReferral = normalizeReferral({
    id: referralData?.id || `REF-${Date.now()}`,
    trackingId,
    ...referralData,
    healthRecordId: referralData?.healthRecordId || referralData?.recordId,
    recordId: referralData?.recordId || referralData?.healthRecordId,
    status: "Pending",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    referralDeadline: referralData?.referralDeadline || deadline,
    statusHistory: [
      {
        status: "Pending",
        timestamp: now.toISOString(),
        label: "Submitted",
      },
    ],
  });

  saveReferrals([newReferral, ...referrals]);
  notifyRhuNewReferral(newReferral);

  return newReferral;
}

export async function updateReferralStatus(referralId, status, changes = {}) {
  await delay();

  const referrals = normalizeReferrals(getAllReferrals());
  const now = new Date().toISOString();
  let updatedReferral = null;

  const updated = referrals.map((referral) => {
    if (referral.id !== referralId && referral.trackingId !== referralId) {
      return referral;
    }

    const nextStatus = normalizeReferralStatus(status);
    updatedReferral = normalizeReferral({
      ...referral,
      ...changes,
      status: nextStatus,
      updatedAt: now,
      statusHistory: appendStatusHistory(referral, nextStatus, {
        timestamp: now,
      }),
    });
    return updatedReferral;
  });

  saveReferrals(updated);
  if (updatedReferral) {
    notifyBhcReferralStatus(updatedReferral, updatedReferral.status);
  }

  return updatedReferral;
}

export async function updateReferralByTrackingId(trackingId, changes) {
  await delay();

  const referrals = normalizeReferrals(getAllReferrals());
  const nextChanges =
    typeof changes === "function" ? changes : () => ({ ...changes });

  let updatedReferral = null;
  const updated = referrals.map((referral) => {
    if (referral.trackingId !== trackingId && referral.id !== trackingId) {
      return referral;
    }

    const computedChanges = nextChanges(referral) || {};
    const previousStatus = normalizeReferralStatus(referral.status);
    const nextStatus = computedChanges.status
      ? normalizeReferralStatus(computedChanges.status)
      : previousStatus;
    const statusChanged = nextStatus !== previousStatus;
    const now = new Date().toISOString();

    updatedReferral = normalizeReferral({
      ...referral,
      ...computedChanges,
      status: nextStatus,
      updatedAt: now,
      statusHistory:
        computedChanges.statusHistory ||
        (statusChanged
          ? appendStatusHistory(referral, nextStatus, { timestamp: now })
          : referral.statusHistory),
    });

    return updatedReferral;
  });

  saveReferrals(updated);
  if (updatedReferral) {
    notifyBhcReferralStatus(updatedReferral, updatedReferral.status);
  }

  return updatedReferral;
}

export async function submitReturnSlip(trackingId, feedbackData = {}) {
  const now = new Date().toISOString();

  const updated = await updateReferralByTrackingId(trackingId, (referral) => {
    const feedback = {
      ...feedbackData,
      dateOfReceipt:
        feedbackData.dateOfReceipt || feedbackData.dateReceived || "",
      timeOfReceipt:
        feedbackData.timeOfReceipt || feedbackData.timeReceived || "",
      patientName:
        feedbackData.patientName ||
        referral.patientName ||
        referral.patient ||
        "",
      ageSex: feedbackData.ageSex || referral.ageSex || "",
      receivingFacility:
        feedbackData.receivingFacility ||
        feedbackData.nameOfHealthCareInstitution ||
        "Rural Health Unit Bulakan",
      nameOfHealthCareInstitution:
        feedbackData.nameOfHealthCareInstitution ||
        feedbackData.receivingFacility ||
        "Rural Health Unit Bulakan",
      receivingPractitioner:
        feedbackData.receivingPractitioner ||
        feedbackData.receivingPersonnel ||
        "",
      initialDiagnosis:
        feedbackData.initialDiagnosis || feedbackData.rhuDiagnosis || "",
      rhuDiagnosis:
        feedbackData.rhuDiagnosis || feedbackData.initialDiagnosis || "",
      actionsTaken: feedbackData.actionsTaken || "",
      recommendation:
        feedbackData.recommendation || feedbackData.instructionsToBhc || "",
      instructionsToBhc:
        feedbackData.instructionsToBhc || feedbackData.recommendation || "",
      additionalNotes: feedbackData.additionalNotes || feedbackData.remarks || "",
      remarks: feedbackData.remarks || feedbackData.additionalNotes || "",
      submittedAt: feedbackData.submittedAt || now,
      submittedBy: feedbackData.submittedBy || "RHU Staff",
    };

    return {
      status: "Completed",
      feedback,
      completedAt: now,
      statusHistory: appendStatusHistory(referral, "Completed", {
        timestamp: now,
        label: "Return Slip Submitted",
      }),
    };
  });

  if (updated) notifyBhcReturnSlip(updated);
  return updated;
}

export async function autoMarkNoShowReferrals() {
  const referrals = normalizeReferrals(getAllReferrals());
  const now = new Date();

  const updated = referrals.map((referral) => {
    const cutoff = getNoShowCutoff(referral);
    if (
      normalizeReferralStatus(referral.status) === "Pending" &&
      cutoff &&
      cutoff < now
    ) {
      const nextReferral = normalizeReferral({
        ...referral,
        status: "No-Show",
        noShowAt: referral.noShowAt || now.toISOString(),
        previousStatus: referral.previousStatus || "Pending",
        statusHistory: referral.noShowAt
          ? referral.statusHistory
          : appendStatusHistory(referral, "No-Show", {
              timestamp: now.toISOString(),
            }),
      });
      notifyBhcReferralStatus(nextReferral, "No-Show");
      return nextReferral;
    }

    return referral;
  });

  saveReferrals(updated);

  return updated;
}

export default {
  getReferrals,
  getReferralById,
  getReferralByTrackingId,
  getReferralsByPatient,
  hasActiveReferralForPatient,
  getReferralByHealthRecordId,
  createReferral,
  updateReferralStatus,
  updateReferralByTrackingId,
  submitReturnSlip,
  autoMarkNoShowReferrals,
  saveReferrals,
  normalizeReferralStatus,
};
