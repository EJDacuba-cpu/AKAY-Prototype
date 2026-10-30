/** Receiving can link a referral to an existing walk-in without changing its source. */
export function isReferredRhuVisit(visit) {
  return Boolean(visit?.referral?.id || visit?.referral_id);
}

export function additionalConcernPayload({ show, chiefComplaint, historyOfPresentIllness }) {
  if (!show) return undefined;
  const chief = String(chiefComplaint || "").trim();
  const hpi = String(historyOfPresentIllness || "").trim();
  if (!chief && !hpi) return undefined;
  return { chiefComplaint: chief, historyOfPresentIllness: hpi };
}
