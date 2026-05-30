import { getAllReferrals, setAllReferrals } from "./localStorageDataService";

const delay = () => new Promise((resolve) => setTimeout(resolve, 300));

function normalizeReferrals(referrals) {
  return Array.isArray(referrals) ? referrals : [];
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

export async function getReferrals() {
  await delay();
  return normalizeReferrals(getAllReferrals());
}

export async function getReferralById(referralId) {
  await delay();
  const referrals = normalizeReferrals(getAllReferrals());
  return referrals.find((r) => r.id === referralId) || null;
}

export async function getReferralByTrackingId(trackingId) {
  await delay();
  const referrals = normalizeReferrals(getAllReferrals());
  return (
    referrals.find(
      (referral) =>
        referral.trackingId === trackingId ||
        referral.id === trackingId,
    ) || null
  );
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

export async function createReferral(referralData) {
  await delay();

  const referrals = normalizeReferrals(getAllReferrals());

  const now = new Date();
  const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const newReferral = {
    id: `REF-${Date.now()}`,
    trackingId: `AKY-${Date.now().toString().slice(-6)}`,
    ...referralData,
    // Keep new referrals in the unified "Pending" status
    status: "Pending",
    createdAt: now.toISOString(),
    referralDeadline: deadline,
  };

  referrals.unshift(newReferral);
  setAllReferrals(referrals);

  return newReferral;
}

export async function updateReferralStatus(referralId, status) {
  await delay();

  const referrals = normalizeReferrals(getAllReferrals());

  const updated = referrals.map((r) =>
    r.id === referralId
      ? {
          ...r,
          status,
        }
      : r,
  );

  setAllReferrals(updated);

  return updated.find((r) => r.id === referralId) || null;
}

export async function updateReferralByTrackingId(trackingId, changes) {
  await delay();

  const referrals = normalizeReferrals(getAllReferrals());
  const nextChanges =
    typeof changes === "function" ? changes : () => ({ ...changes });

  let updatedReferral = null;
  const updated = referrals.map((r) => {
    if (r.trackingId !== trackingId) return r;
    updatedReferral = {
      ...r,
      ...nextChanges(r),
      updatedAt: new Date().toISOString(),
    };
    return updatedReferral;
  });

  setAllReferrals(updated);

  return updatedReferral;
}

export async function autoMarkNoShowReferrals() {
  const referrals = normalizeReferrals(getAllReferrals());
  const now = new Date();

  const updated = referrals.map((referral) => {
    const cutoff = getNoShowCutoff(referral);
    if (referral.status === "Pending" && cutoff && cutoff < now) {
      return {
        ...referral,
        status: "No-Show",
        noShowAt: referral.noShowAt || now.toISOString(),
        previousStatus: referral.previousStatus || "Pending",
      };
    }

    return referral;
  });

  setAllReferrals(updated);

  return updated;
}

export default {
  getReferrals,
  getReferralById,
  getReferralByTrackingId,
  getReferralsByPatient,
  createReferral,
  updateReferralStatus,
  updateReferralByTrackingId,
  autoMarkNoShowReferrals,
};
