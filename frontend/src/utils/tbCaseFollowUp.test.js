import assert from "node:assert/strict";
import { test } from "node:test";
import { projectTbCaseCard, tbFollowUpLabPayload, tbCaseClosePayload, tbCaseReopenPayload, tbCaseFollowUpErrors, tbCaseFollowUpAttempt } from "./tbCaseFollowUp.js";

test("current closure projects into the card without mutating its registered snapshot", () => {
  const card = { diagnosis: { tbCaseNumber: "TB-2026-1" }, outcome: { status: "", date: "" } };
  assert.deepEqual(projectTbCaseCard({ status: "closed", outcome_status: "cured", outcome_on: "2026-11-10", card_data: card }).outcome, { status: "cured", date: "2026-11-10" });
  assert.deepEqual(card.outcome, { status: "", date: "" });
  assert.deepEqual(projectTbCaseCard({ status: "active", outcome_status: null, card_data: card }).outcome, { status: "", date: "" });
});

test("laboratory payloads keep explicit milestone dates and clear unreported results", () => {
  assert.deepEqual(tbFollowUpLabPayload({ milestone: "month_2", testName: " DSSM ", dueOn: "2026-03-01", status: "requested", result: "hidden result", notes: " RHU follow-up " }), {
    milestone: "month_2", test_name: "DSSM", due_on: "2026-03-01", status: "requested", collection_on: null, examination_on: null, result: null, notes: "RHU follow-up",
  });
});

test("physician commands include only reviewed case version, selected evidence and attestation", () => {
  assert.deepEqual(tbCaseClosePayload({ outcomeStatus: "cured", outcomeOn: "2026-11-10", note: " Physician review ", evidenceIds: ["7"], confirmed: true, card_data: {} }, 4), {
    case_version: 4, outcome_status: "cured", outcome_on: "2026-11-10", note: "Physician review", evidence_lab_ids: [7], confirmed: true,
  });
  assert.deepEqual(tbCaseReopenPayload({ note: " Reconcile ", confirmed: true }, 5), { case_version: 5, note: "Reconcile", confirmed: true });
});

test("missing result, future examination, cure evidence and missing physician confirmation are rejected", () => {
  const context = { start_date: "2026-01-01", today: "2026-11-10" };
  assert.ok(tbCaseFollowUpErrors(tbFollowUpLabPayload({ testName: "DSSM", milestone: "month_6", dueOn: "2026-11-01", status: "result_available", examinationOn: "2026-11-11" }), context, "lab").examination_on);
  const closure = tbCaseClosePayload({ outcomeStatus: "cured", outcomeOn: "2026-11-10", note: "Reviewed" }, 2);
  assert.ok(tbCaseFollowUpErrors(closure, context, "close").evidence_lab_ids);
  assert.ok(tbCaseFollowUpErrors(closure, context, "close").confirmed);
});

test("retry identity is frozen per lab or lifecycle command", () => {
  let count = 0; const key = () => `key-${++count}`;
  const body = { case_version: 2, outcome_status: "cured" };
  const first = tbCaseFollowUpAttempt(null, 7, "close", null, body, key);
  body.case_version = 3;
  assert.equal(first.payload.case_version, 2);
  assert.equal(tbCaseFollowUpAttempt(first, 7, "close", null, { case_version: 2, outcome_status: "cured" }, key).key, "key-1");
  assert.equal(tbCaseFollowUpAttempt(first, 7, "reopen", null, { case_version: 2 }, key).key, "key-2");
});
