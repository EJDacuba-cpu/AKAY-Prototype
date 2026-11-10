import { tbRegistrationAttempt } from "./tbRegistration.js";

export const TB_MILESTONES = { month_2: "Month 2", month_5: "Month 5", month_6: "Month 6", other: "Other follow-up" };
export const TB_LAB_STATUSES = { requested: "Requested", awaiting_result: "Awaiting result", result_available: "Result available", cancelled: "Cancelled" };
export const TB_OUTCOMES = { cured: "Cured", treatment_completed: "Treatment Completed", treatment_failed: "Failed", lost_to_follow_up: "Lost to Follow-up", died: "Died" };

export function projectTbCaseCard(tbCase) {
  return { ...tbCase.card_data, outcome: { status: tbCase.status === "closed" ? tbCase.outcome_status || "" : "", date: tbCase.status === "closed" ? tbCase.outcome_on || "" : "" } };
}

export function tbFollowUpLabPayload(fields, lab = null) {
  const data = { milestone: fields.milestone || "", test_name: String(fields.testName || "").trim(), due_on: fields.dueOn || "", status: fields.status || "requested",
    collection_on: fields.collectionOn || null, examination_on: fields.examinationOn || null,
    result: fields.status === "result_available" ? String(fields.result || "").trim() : null, notes: String(fields.notes || "").trim() };
  return lab ? { ...data, version: Number(lab.version), correction_reason: String(fields.correctionReason || "").trim() } : data;
}

export function tbCaseClosePayload(fields, version) {
  return { case_version: Number(version), outcome_status: fields.outcomeStatus || "", outcome_on: fields.outcomeOn || "",
    note: String(fields.note || "").trim(), confirmed: Boolean(fields.confirmed), evidence_lab_ids: (fields.evidenceIds || []).map(Number) };
}

export function tbCaseReopenPayload(fields, version) {
  return { case_version: Number(version), note: String(fields.note || "").trim(), confirmed: Boolean(fields.confirmed) };
}

const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || "") && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
export function tbCaseFollowUpErrors(payload, context, action) {
  const errors = {};
  const dateError = (date, field, future = false) => {
    if (!validDate(date) || !context.start_date || date < context.start_date || (!future && date > context.today)) errors[field] = "Use a valid date from the prescribed start; observed dates cannot be in the future.";
  };
  if (action === "lab") {
    if (!TB_MILESTONES[payload.milestone]) errors.milestone = "Choose a follow-up milestone.";
    if (!payload.test_name) errors.test_name = "Enter the laboratory test.";
    dateError(payload.due_on, "due_on", true);
    for (const field of ["collection_on", "examination_on"]) if (payload[field]) dateError(payload[field], field);
    if (payload.status === "result_available") {
      if (!payload.result) errors.result = "Enter the recorded result.";
      dateError(payload.examination_on, "examination_on");
    }
    if (payload.collection_on && payload.examination_on && payload.collection_on > payload.examination_on) errors.collection_on = "Collection cannot follow examination.";
    if (payload.version && !payload.correction_reason) errors.correction_reason = "Enter the reason for this laboratory revision.";
  } else {
    if (!payload.note) errors.note = "Document the clinical reason for this decision.";
    if (!payload.confirmed) errors.confirmed = "Confirm physician review and authorization.";
    if (action === "close") {
      if (!TB_OUTCOMES[payload.outcome_status]) errors.outcome_status = "Select the physician-determined outcome.";
      dateError(payload.outcome_on, "outcome_on");
      if (payload.outcome_status === "cured" && !payload.evidence_lab_ids.length) errors.evidence_lab_ids = "Select completed laboratory evidence for physician review of Cured.";
    }
  }
  return errors;
}

export function tbCaseFollowUpAttempt(previous, caseId, action, labId, payload, createKey) {
  return { ...tbRegistrationAttempt(previous, `${caseId}:${action}:${labId || "new"}`, payload, createKey), caseId, action, labId };
}
