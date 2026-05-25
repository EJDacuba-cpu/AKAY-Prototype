import { getItem, setItem } from "./storageService";

const REFERRALS_KEY = "bhc_referrals";

const delay = () => new Promise((resolve) => setTimeout(resolve, 300));

function getStoredReferrals() {
  const referrals = getItem(REFERRALS_KEY, []);
  return Array.isArray(referrals) ? referrals : [];
}

function saveStoredReferrals(referrals) {
  setItem(REFERRALS_KEY, referrals);
}

export async function getReferrals() {
  await delay();
  return getStoredReferrals();
}

export async function getReferralById(referralId) {
  await delay();
  const referrals = getStoredReferrals();
  return referrals.find((r) => r.id === referralId) || null;
}

export async function createReferral(referralData) {
  await delay();

  const referrals = getStoredReferrals();

  const now = new Date();
  const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const newReferral = {
    id: `REF-${Date.now()}`,
    trackingId: `AKY-${Date.now().toString().slice(-6)}`,
    ...referralData,
    status: "Pending RHU Review",
    createdAt: now.toISOString(),
    referralDeadline: deadline,
  };

  referrals.unshift(newReferral);
  saveStoredReferrals(referrals);

  return newReferral;
}

export async function updateReferralStatus(referralId, status) {
  await delay();

  const referrals = getStoredReferrals();

  const updated = referrals.map((r) =>
    r.id === referralId
      ? {
          ...r,
          status,
        }
      : r,
  );

  saveStoredReferrals(updated);

  return updated.find((r) => r.id === referralId) || null;
}

export async function autoMarkNoShowReferrals() {
  const referrals = getStoredReferrals();
  const now = new Date();

  const updated = referrals.map((referral) => {
    if (
      referral.status === "Pending RHU Review" &&
      new Date(referral.referralDeadline) < now
    ) {
      return {
        ...referral,
        status: "No-Show",
      };
    }

    return referral;
  });

  saveStoredReferrals(updated);

  return updated;
}

export default {
  getReferrals,
  getReferralById,
  createReferral,
  updateReferralStatus,
  autoMarkNoShowReferrals,
};
