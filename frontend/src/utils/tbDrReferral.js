import { tbRegistrationAttempt } from "./tbRegistration.js";

export function tbDrIssuePayload(fields, revision) {
  return { source_revision: revision, destination_name: String(fields.destinationName || "").trim(),
    destination_address: String(fields.destinationAddress || "").trim(), destination_contact: String(fields.destinationContact || "").trim(),
    reason: String(fields.reason || "").trim(), confirmed: Boolean(fields.confirmed) };
}

export function tbDrStatusPayload(fields, version) {
  return { version: Number(version), status: fields.status || "", event_on: fields.eventOn || "", note: String(fields.note || "").trim() };
}

export function tbDrReferralErrors(payload, context = {}) {
  const errors = {};
  if (payload.version != null) {
    if (!context.allowed_statuses?.some(option => option.value === payload.status)) errors.status = "Choose an available referral disposition.";
    if (!payload.note) errors.note = "Record the note or reported basis for this update.";
    const date = payload.event_on;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
      || date < context.earliest_event_on || date > context.today) errors.event_on = "Choose a date from the last recorded event through today.";
  } else {
    if (!payload.destination_name) errors.destination_name = "Enter the external PMDT / DR-TB facility.";
    if (!payload.reason) errors.reason = "Enter the clinical reason for referral.";
    if (!payload.confirmed) errors.confirmed = "Review the evidence and confirm physician authorization.";
  }
  return errors;
}

export function tbDrReferralAttempt(previous, recordId, referralId, payload, createKey) {
  return { ...tbRegistrationAttempt(previous, `${recordId}:${referralId || "issue"}`, payload, createKey), recordId, referralId };
}
