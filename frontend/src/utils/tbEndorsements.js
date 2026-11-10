export { tbRegistrationAttempt as tbEndorsementAttempt } from "./tbRegistration.js";

export const TB_ENDORSEMENT_LABELS = {
  linkage_needed: "Needs patient link", pending_review: "Pending BHC review", accepted: "Accepted for DOTS",
  declined: "Declined", revoked: "Revoked",
};

export function tbEndorsementPayload({ caseVersion, receivingBhcId, note }) {
  return { case_version: Number(caseVersion), receiving_bhc_id: Number(receivingBhcId), note: String(note || "").trim() };
}

export function tbEndorsementErrors(payload) {
  const errors = {};
  if (!Number.isInteger(payload.case_version) || payload.case_version < 1) errors.case_version = "Refresh the case before endorsing.";
  if (!Number.isInteger(payload.receiving_bhc_id) || payload.receiving_bhc_id < 1) errors.receiving_bhc_id = "Select a receiving BHC.";
  if (!payload.note?.trim()) errors.note = "Enter the treatment handoff instructions.";
  return errors;
}

export function tbEndorsementActionPayload(action, row, fields = {}) {
  const version = Number(row.version);
  switch (action) {
    case "link": return { version, linked_patient_id: Number(fields.linkedPatientId), identity_confirmed: Boolean(fields.identityConfirmed) };
    case "accept": return { version, confirmed: Boolean(fields.confirmed) };
    case "decline": return { version, reason: String(fields.reason || "").trim() };
    case "revoke": return { version, case_version: Number(row.case_version), reason: String(fields.reason || "").trim() };
    default: throw new Error("Unsupported TB endorsement action.");
  }
}

export function tbDecisionRecorded(action, payload, row) {
  if (!row) return false;
  if (action === "accept") return row.status === "accepted";
  if (action === "link") return ["pending_review", "accepted"].includes(row.status) && Number(row.linked_patient?.id) === Number(payload.linked_patient_id);
  if (action === "decline" || action === "revoke") return row.status === (action === "decline" ? "declined" : "revoked") && row.reason === payload.reason;
  return false;
}
