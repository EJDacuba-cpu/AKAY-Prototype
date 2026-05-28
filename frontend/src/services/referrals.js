import { getAllReferrals, setAllReferrals } from "./localStorageDataService";

const delay = () => new Promise((resolve) => setTimeout(resolve, 300));

function normalizeReferrals(referrals) {
  return Array.isArray(referrals) ? referrals : [];
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
    status: "Pending RHU Review",
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

export async function autoMarkNoShowReferrals() {
  const referrals = normalizeReferrals(getAllReferrals());
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

  setAllReferrals(updated);

  return updated;
}

export default {
  getReferrals,
  getReferralById,
  createReferral,
  updateReferralStatus,
  autoMarkNoShowReferrals,
};
