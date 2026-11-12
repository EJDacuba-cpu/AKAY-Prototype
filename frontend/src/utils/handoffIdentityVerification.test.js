import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canRegisterSourceAtBhc,
  compareIdentityFields,
  identitySourceLabel,
  isSameSharedPatient,
  verificationStatusLabel,
} from "./handoffIdentityVerification.js";

test("identity labels are stable", () => {
  assert.equal(identitySourceLabel("rhu_walk_in"), "RHU Walk-in");
  assert.equal(identitySourceLabel("bhc_referral_return"), "BHC Referral Return");
  assert.equal(verificationStatusLabel("awaiting_verification"), "Awaiting Verification");
  assert.equal(verificationStatusLabel("needs_review"), "Requires Review");
});

test("same shared patient detection never merges different ids", () => {
  assert.equal(isSameSharedPatient({ id: 12 }, { id: 12 }), true);
  assert.equal(isSameSharedPatient({ id: 12 }, { id: 99 }), false);
});

test("identity comparison marks mismatched ids", () => {
  const rows = compareIdentityFields(
    { id: 1, first_name: "Ana", last_name: "Cruz", birthdate: "1990-01-01", sex: "Female" },
    { id: 2, first_name: "Ana", last_name: "Cruz", birthdate: "1990-01-01", sex: "Female" },
  );
  const idRow = rows.find((row) => row.label === "Patient ID");
  assert.equal(idRow.match, false);
  assert.equal(rows.find((row) => row.label === "Name").match, true);
});

test("register-at-bhc eligibility requires a successful empty search", () => {
  assert.equal(canRegisterSourceAtBhc({ searchState: "idle", matches: [] }), false);
  assert.equal(canRegisterSourceAtBhc({ searchState: "error", matches: [] }), false);
  assert.equal(canRegisterSourceAtBhc({ searchState: "success", matches: [{ id: 1 }] }), false);
  assert.equal(canRegisterSourceAtBhc({ searchState: "success", matches: [], selectedMatch: { id: 9 } }), false);
  assert.equal(canRegisterSourceAtBhc({ searchState: "success", matches: [], needsReview: true }), false);
  assert.equal(canRegisterSourceAtBhc({ searchState: "success", matches: [] }), true);
});
