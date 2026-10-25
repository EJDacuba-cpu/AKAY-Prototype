/** Same ITR workspace both Today's Queue and the patient profile open after start/resume. */
export function rhuConsultationPath(visitId, patientId) {
  return `/rhu/health-records/add?visitId=${visitId}&patientId=${patientId}&mode=continue`;
}

/** Opens the RHU profile Referrals tab on the visit's linked referral. Navigation only; never changes visit status. */
export function reviewReferralSlipPath(patientId, referralId) {
  return `/rhu/patients/${patientId}?tab=referrals&referral=${referralId}`;
}
