function uniquePositiveIds(ids) {
  const seen = new Set();
  const unique = [];
  for (const value of ids || []) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

/** Same ITR workspace both Today's Queue and the patient profile open after start/resume. */
export function rhuConsultationPath(visitId, patientId, followUpIds = []) {
  const path = `/rhu/health-records/add?visitId=${visitId}&patientId=${patientId}&mode=continue`;
  const ids = uniquePositiveIds(followUpIds);
  return ids.length ? `${path}&followUpIds=${ids.join(",")}` : path;
}

/** Profile Referrals tab. Navigation only; never changes visit status. */
export function rhuPatientReferralsPath(patientId) {
  return `/rhu/patients/${patientId}?tab=referrals`;
}

/** Dedicated read-only BHC slip for one referral on this patient's profile. */
export function reviewReferralSlipPath(patientId, referralId) {
  return `/rhu/patients/${patientId}/referrals/${referralId}`;
}

/** Follow-up task ids stored on the started RHU visit, if any. */
export function visitContinuedFollowUpIds(visit) {
  return uniquePositiveIds(visit?.continued_follow_up_task_ids ?? visit?.continuedFollowUpTaskIds ?? []);
}

/**
 * Resume uses the ids stored on the visit. Until the visit loads, the start
 * URL (or a legacy singular followUpTaskId) is enough to focus the workspace.
 */
export function selectedRhuFollowUpIds({ queryIds = [], singularId = 0, visit } = {}) {
  const stored = visit?.continued_follow_up_task_ids ?? visit?.continuedFollowUpTaskIds;
  if (stored != null) return visitContinuedFollowUpIds(visit);
  const fromQuery = uniquePositiveIds(queryIds);
  if (fromQuery.length) return fromQuery;
  const singular = Number(singularId);
  return Number.isInteger(singular) && singular > 0 ? [singular] : [];
}
