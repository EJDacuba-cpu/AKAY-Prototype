import assert from "node:assert/strict";
import { test } from "node:test";
import { tbDrIssuePayload, tbDrStatusPayload, tbDrReferralErrors, tbDrReferralAttempt } from "./tbDrReferral.js";

test("outbound issuance sends only physician-reviewed source and destination fields", () => {
  assert.deepEqual(tbDrIssuePayload({ destinationName: " PMDT facility ", destinationAddress: " Address ", destinationContact: " Contact ", reason: " Specialized evaluation ", confirmed: true, patient_id: 99 }, "revision"), {
    source_revision: "revision", destination_name: "PMDT facility", destination_address: "Address", destination_contact: "Contact", reason: "Specialized evaluation", confirmed: true,
  });
});

test("status records contain a version and report, without altering destination or diagnosis", () => {
  assert.deepEqual(tbDrStatusPayload({ status: "sent", eventOn: "2026-11-10", note: " Slip delivered ", destinationName: "forged" }, 2), {
    version: 2, status: "sent", event_on: "2026-11-10", note: "Slip delivered",
  });
});

test("authorization, missing destination and invalid report dates require correction", () => {
  assert.ok(tbDrReferralErrors(tbDrIssuePayload({}, "rev")).confirmed);
  assert.ok(tbDrReferralErrors(tbDrIssuePayload({ confirmed: true }, "rev")).destination_name);
  const context = { earliest_event_on: "2026-11-10", today: "2026-11-11", allowed_statuses: [{ value: "sent" }] };
  assert.deepEqual(tbDrReferralErrors({ version: 1, status: "sent", note: "Handed to patient", event_on: "2026-11-11" }, context), {});
  for (const changes of [{ event_on: "2026-11-09" }, { event_on: "2026-11-12" }, { event_on: "2026-11-31" }, { status: "cured" }, { note: "" }]) {
    assert.ok(Object.keys(tbDrReferralErrors({ version: 1, status: "sent", note: "Report", event_on: "2026-11-10", ...changes }, context)).length);
  }
});

test("lost-response retries retain their frozen key and payload while a new disposition gets a new identity", () => {
  let count = 0; const key = () => `key-${++count}`;
  const body = { reason: "Original" };
  const attempt = tbDrReferralAttempt(null, 7, null, body, key);
  body.reason = "Mutated";
  assert.equal(attempt.payload.reason, "Original");
  assert.equal(tbDrReferralAttempt(attempt, 7, null, { reason: "Original" }, key).key, "key-1");
  assert.equal(tbDrReferralAttempt(attempt, 7, 3, { version: 1, status: "sent" }, key).key, "key-2");
});
