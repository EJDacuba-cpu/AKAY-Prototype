const REFERRALS_KEY = "bhc_referrals";

const delay = () => new Promise((resolve) => setTimeout(resolve, 300));

/* GET ALL REFERRALS */
export async function getReferrals() {
  await delay();

  return JSON.parse(localStorage.getItem(REFERRALS_KEY) || "[]");
}

/* GET SINGLE REFERRAL */
export async function getReferralById(referralId) {
  await delay();

  const referrals = JSON.parse(localStorage.getItem(REFERRALS_KEY) || "[]");

  return referrals.find((r) => r.id === referralId) || null;
}

/* CREATE REFERRAL */
export async function createReferral(referralData) {
  await delay();

  const referrals = JSON.parse(localStorage.getItem(REFERRALS_KEY) || "[]");

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

  localStorage.setItem(REFERRALS_KEY, JSON.stringify(referrals));

  return newReferral;
}

/* UPDATE STATUS */
export async function updateReferralStatus(referralId, status) {
  await delay();

  const referrals = JSON.parse(localStorage.getItem(REFERRALS_KEY) || "[]");

  const updated = referrals.map((r) =>
    r.id === referralId
      ? {
          ...r,
          status,
        }
      : r,
  );

  localStorage.setItem(REFERRALS_KEY, JSON.stringify(updated));

  return updated.find((r) => r.id === referralId);
}

/* AUTO NO SHOW CHECK */
export async function autoMarkNoShowReferrals() {
  const referrals = JSON.parse(localStorage.getItem(REFERRALS_KEY) || "[]");

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

  localStorage.setItem(REFERRALS_KEY, JSON.stringify(updated));

  return updated;
}

export default {
  getReferrals,
  getReferralById,
  createReferral,
  updateReferralStatus,
  autoMarkNoShowReferrals,
};
