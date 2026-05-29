import { getAllReferrals, setAllReferrals } from "./localStorageDataService";

const delay = () => new Promise((resolve) => setTimeout(resolve, 300));

function normalizeReferrals(referrals) {
  return Array.isArray(referrals) ? referrals : [];
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
  createReferral,
  updateReferralStatus,
  updateReferralByTrackingId,
  autoMarkNoShowReferrals,
};
