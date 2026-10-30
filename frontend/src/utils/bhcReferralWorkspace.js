export const TAB_SENT = "sent";
export const TAB_WAITING = "waiting";

export const WAITING_EMPTY_TITLE = "No referrals waiting to submit.";
export const WAITING_EMPTY_DESCRIPTION =
  "When a consultation is saved because the receiving RHU has no available doctor, it will appear here under Waiting to Submit until staff check availability and submit it.";
export const UNSENT_NOT_APPOINTMENT =
  "An unsent referral is not an accepted RHU appointment.";
export const AWAITING_DOCTOR_STATUS = "Awaiting doctor availability";

export function waitingHoldCard(hold = {}) {
  const id = hold.id != null ? String(hold.id) : "";
  return {
    id,
    patientName: hold.patientName || "Unknown Patient",
    consultationDate: hold.consultationDate || hold.createdAt || "",
    receivingRhu: hold.ruralHealthUnitName || "Unassigned RHU",
    reason: hold.reasonForReferral || "Not recorded",
    status: AWAITING_DOCTOR_STATUS,
    detailsPath: id ? `/bhc/referrals/waiting/${id}` : "/bhc/referrals",
    submitPath: id ? `/bhc/referrals/waiting/${id}?submit=1` : "/bhc/referrals",
    viewLabel: "View Details",
    submitLabel: "Check Availability & Submit",
  };
}

export function consultationFinalizeLabel({
  canFinalize = true,
  needsReferral = false,
  doctorAvailable = true,
} = {}) {
  if (!canFinalize) return "Submit for Review";
  if (!needsReferral) return "Finalize Consultation";
  if (doctorAvailable) return "Finalize Consultation & Submit Referral";
  return "Finalize Consultation & Save Referral for Later";
}

export function unavailableReferralGuidance({
  facilityName = "the receiving RHU",
  isPriority = false,
  alternativeNames = [],
} = {}) {
  const alternatives = Array.isArray(alternativeNames) ? alternativeNames : [];
  if (isPriority) {
    return {
      headline: `No doctor is currently available at ${facilityName}.`,
      body: "Waiting for doctor availability is not the preferred option for a Priority referral. Choose an authorized alternative facility if one is available. Saving for later is not an accepted RHU appointment.",
      showSaveForLater: true,
      saveForLaterIsDefault: false,
      alternatives,
    };
  }

  return {
    headline: `No doctor is currently available at ${facilityName}.`,
    body: `You can finalize this consultation and save the referral under Waiting to Submit. ${UNSENT_NOT_APPOINTMENT}`,
    showSaveForLater: true,
    saveForLaterIsDefault: true,
    alternatives,
  };
}

export function discardReasonError(reason) {
  const trimmed = String(reason || "").trim();
  if (!trimmed) return "Enter a reason for discarding this unsent referral.";
  if (trimmed.length < 8) {
    return "Give a brief audited reason (at least 8 characters).";
  }
  return "";
}

export default {
  TAB_SENT,
  TAB_WAITING,
  waitingHoldCard,
  consultationFinalizeLabel,
  unavailableReferralGuidance,
  discardReasonError,
};
