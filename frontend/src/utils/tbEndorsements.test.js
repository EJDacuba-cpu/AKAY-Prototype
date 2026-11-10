import assert from "node:assert/strict";
import test from "node:test";
import { tbEndorsementPayload, tbEndorsementActionPayload, tbEndorsementErrors, tbEndorsementAttempt, tbDecisionRecorded } from "./tbEndorsements.js";

test("endorsement payload carries only target, instructions and case version", () => {
  assert.deepEqual(tbEndorsementPayload({ caseVersion: 3, receivingBhcId: "8", note: " Support DOTS ", card_data: { outcome: "cured" } }),
    { case_version: 3, receiving_bhc_id: 8, note: "Support DOTS" });
  assert.ok(tbEndorsementErrors(tbEndorsementPayload({ caseVersion: 1, receivingBhcId: "", note: "" })).receiving_bhc_id);
  assert.ok(tbEndorsementErrors({ case_version: 1, receiving_bhc_id: 8, note: "" }).note);
});

test("receiver and revocation payloads preserve reviewed versions without clinical fields", () => {
  const row = { version: 2, case_version: 4 };
  assert.deepEqual(tbEndorsementActionPayload("link", row, { linkedPatientId: "23", identityConfirmed: true }),
    { version: 2, linked_patient_id: 23, identity_confirmed: true });
  assert.deepEqual(tbEndorsementActionPayload("accept", row, { confirmed: true }), { version: 2, confirmed: true });
  assert.deepEqual(tbEndorsementActionPayload("revoke", row, { reason: " Transfer " }), { version: 2, case_version: 4, reason: "Transfer" });
  assert.throws(() => tbEndorsementActionPayload("change_regimen", row, {}));
});

test("the same endorsement attempt keeps its key across network retries while target changes rotate it", () => {
  const body = tbEndorsementPayload({ caseVersion: 1, receivingBhcId: 8, note: "DOTS support" });
  const first = tbEndorsementAttempt(null, 12, body, () => "first");
  assert.equal(tbEndorsementAttempt(first, 12, body, () => "unused"), first);
  body.receiving_bhc_id = 9;
  assert.equal(first.payload.receiving_bhc_id, 8);
  assert.equal(tbEndorsementAttempt(first, 12, body, () => "next").key, "next");
});

test("response recovery recognizes only the recorded intent and never treats revocation as acceptance", () => {
  assert.equal(tbDecisionRecorded("accept", {}, { status: "accepted" }), true);
  assert.equal(tbDecisionRecorded("accept", {}, { status: "revoked" }), false);
  assert.equal(tbDecisionRecorded("link", { linked_patient_id: 23 }, { status: "accepted", linked_patient: { id: 23 } }), true);
  assert.equal(tbDecisionRecorded("link", { linked_patient_id: 23 }, { status: "pending_review", linked_patient: { id: 24 } }), false);
  assert.equal(tbDecisionRecorded("revoke", { reason: "Transfer" }, { status: "revoked", reason: "Transfer" }), true);
  assert.equal(tbDecisionRecorded("revoke", { reason: "Transfer" }, { status: "revoked", reason: "Other" }), false);
});
