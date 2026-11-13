import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canRegisterSourceAtBhc,
  canVerifyCrossRecordLink,
  compareIdentityFields,
  hasDemographicConflict,
  identitySourceLabel,
  isPotentialDemographicMatch,
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

test("potential demographic match ignores capitalization and spacing", () => {
  const source = { first_name: "Testing", middle_name: "T", last_name: "Bee", birthdate: "2000-08-24", sex: "Male" };
  const candidate = { first_name: " testing ", middle_name: "t", last_name: "BEE", birthdate: "2000-08-24", sex: "male" };
  assert.equal(isPotentialDemographicMatch(source, candidate), true);
  assert.equal(hasDemographicConflict(source, { ...candidate, last_name: "Bea" }), true);
});

test("cross-record link never auto-links without staff confirmation", () => {
  const source = { id: 19, first_name: "Testing", middle_name: "T", last_name: "Bee", birthdate: "2000-08-24", sex: "Male" };
  const candidate = { id: 20, first_name: "Testing", middle_name: "T", last_name: "Bee", birthdate: "2000-08-24", sex: "Male" };
  assert.equal(canVerifyCrossRecordLink({ source, candidate, identityConfirmed: false }), false);
  assert.equal(canVerifyCrossRecordLink({ source, candidate, identityConfirmed: true }), true);
  assert.equal(canVerifyCrossRecordLink({ source, candidate, identityConfirmed: true, needsReview: true }), false);
  assert.equal(canVerifyCrossRecordLink({
    source,
    candidate: { ...candidate, last_name: "Other" },
    identityConfirmed: true,
  }), false);
});

test("register-at-bhc eligibility requires a successful empty search", () => {
  assert.equal(canRegisterSourceAtBhc({ searchState: "idle", matches: [] }), false);
  assert.equal(canRegisterSourceAtBhc({ searchState: "error", matches: [] }), false);
  assert.equal(canRegisterSourceAtBhc({ searchState: "success", matches: [{ id: 1 }] }), false);
  assert.equal(canRegisterSourceAtBhc({ searchState: "success", matches: [], selectedMatch: { id: 9 } }), false);
  assert.equal(canRegisterSourceAtBhc({ searchState: "success", matches: [], needsReview: true }), false);
  assert.equal(canRegisterSourceAtBhc({ searchState: "success", matches: [] }), true);
});
