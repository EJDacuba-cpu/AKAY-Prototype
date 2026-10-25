import {
  formatDisplayValue,
  formatFacilityName,
  formatLongDate,
  formatPatientName,
  formatReferralStatus,
} from "./formatters.js";

const OFFICIAL_STATUSES = ["Pending", "Received", "Completed", "No-Show"];

export const RECEIVED_QUEUE_MESSAGE =
  "Patient received and added to today's RHU queue.";

export function officialReferralStatus(status) {
  const display = formatReferralStatus(status, "Pending");
  return OFFICIAL_STATUSES.includes(display) ? display : display;
}

export function canReceiveReferral(status) {
  const official = officialReferralStatus(status);
  return official === "Pending" || official === "No-Show";
}

export function isReferralAlreadyReceived(status) {
  const official = officialReferralStatus(status);
  return official === "Received" || official === "Completed";
}

export function registrationAddress(source = {}) {
  return [
    source.address,
    source.streetAddress,
    source.street_address,
    source.purok_area,
    source.barangay,
    source.municipality,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join(", ");
}

export function arrivalIdentity(referral = {}) {
  const patient =
    referral.patient && typeof referral.patient === "object"
      ? referral.patient
      : {};

  const fullName = formatPatientName(
    referral.patientName || patient || referral,
    "Unknown Patient",
  );
  const birthDate =
    referral.birthDate ||
    referral.birthdate ||
    referral.dateOfBirth ||
    patient.birthdate ||
    patient.birthDate ||
    patient.birth_date ||
    patient.dateOfBirth ||
    "";
  const age = referral.age ?? patient.age;
  const sex = referral.sex || patient.sex || "";
  const address =
    referral.address ||
    referral.patientAddress ||
    registrationAddress(patient) ||
    registrationAddress(referral);
  const contact =
    referral.contactNumber ||
    referral.patientContact ||
    referral.contact ||
    patient.contact_number ||
    patient.contactNumber ||
    patient.contact ||
    "";

  return {
    fullName,
    birthDate,
    birthDateLabel: formatLongDate(birthDate, ""),
    age: age === 0 || age ? String(age) : "",
    sex,
    address,
    contact,
  };
}

export function arrivalReferralMeta(referral = {}) {
  return {
    trackingId: referral.trackingId || referral.tracking_id || "",
    referringBhc: formatFacilityName(
      referral.referringHci ||
        referral.referringBHC ||
        referral.sending_bhc ||
        referral.barangayHealthCenter,
      "Not recorded",
    ),
    receivingRhu: formatFacilityName(
      referral.destinationFacility ||
        referral.receivingFacility ||
        referral.receiving_rhu ||
        referral.ruralHealthUnit,
      "Not recorded",
    ),
    referredAt: referral.referralDateTime || referral.createdAt || referral.referred_at || "",
    status: officialReferralStatus(referral.status),
  };
}

export function missingIdentityLabel(value) {
  return formatDisplayValue(value, "Not recorded");
}

export function receiveConfirmCopy(identity = {}, lateArrival = false) {
  const name = identity.fullName || "this patient";
  if (lateArrival) {
    return {
      title: "Confirm late arrival?",
      description: `Confirm this is ${name} and that they have now arrived at the RHU. A late-arrival note is required. Receiving adds them to today's queue.`,
      confirmText: "Receive Patient",
    };
  }

  return {
    title: "Receive this patient?",
    description: `Confirm this is ${name}. Verify their identity against the registration record, then confirm they have arrived at the RHU. Receiving adds them to today's queue.`,
    confirmText: "Receive Patient",
  };
}
