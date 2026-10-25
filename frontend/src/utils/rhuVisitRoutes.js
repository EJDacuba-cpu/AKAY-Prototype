/** Same ITR workspace both Today's Queue and the patient profile open after start/resume. */
export function rhuConsultationPath(visitId, patientId) {
  return `/rhu/health-records/add?visitId=${visitId}&patientId=${patientId}&mode=continue`;
}

/** Profile Referrals tab. Navigation only; never changes visit status. */
export function rhuPatientReferralsPath(patientId) {
  return `/rhu/patients/${patientId}?tab=referrals`;
}

/** Dedicated read-only BHC slip for one referral on this patient's profile. */
export function reviewReferralSlipPath(patientId, referralId) {
  return `/rhu/patients/${patientId}/referrals/${referralId}`;
}
