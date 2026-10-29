import assert from "node:assert/strict";
import test from "node:test";

import { getPatientSex, isInfantPatient } from "./patientUtils.js";

const DOB = "2025-10-04";
function daysAfterMonths(months, days = 0) {
  const dob = new Date(DOB);
  return new Date(dob.getFullYear(), dob.getMonth() + months, dob.getDate() + days, 12);
}

test("isInfantPatient is true from birth through 12 completed months", () => {
  assert.equal(isInfantPatient(DOB, daysAfterMonths(0)), true);
  assert.equal(isInfantPatient(DOB, daysAfterMonths(12)), true);
  assert.equal(isInfantPatient(DOB, daysAfterMonths(13, -1)), true);
});

test("isInfantPatient is false at 13 completed months", () => {
  assert.equal(isInfantPatient(DOB, daysAfterMonths(13)), false);
});

test("isInfantPatient is false for missing, invalid, or future birth dates", () => {
  const today = daysAfterMonths(1);
  assert.equal(isInfantPatient("", today), false);
  assert.equal(isInfantPatient(undefined, today), false);
  assert.equal(isInfantPatient("not a date", today), false);
  assert.equal(isInfantPatient(DOB, daysAfterMonths(0, -1)), false);
});

test("reads the stored sex field", () => {
  assert.equal(getPatientSex({ sex: "Female" }), "Female");
  assert.equal(getPatientSex({ sex: " Male " }), "Male");
});

/**
 * Regression: the patient list used to filter on ageSex.includes("/f"), but
 * ageSex is rendered as "34 yrs / Female" - spaces around the slash - so
 * selecting a sex matched nothing at all.
 */
test("falls back to the ageSex display string when sex is missing", () => {
  assert.equal(getPatientSex({ ageSex: "34 yrs / Female" }), "Female");
  assert.equal(getPatientSex({ ageSex: "41 yrs / Male" }), "Male");
  assert.equal(getPatientSex({ ageSex: "Female" }), "Female");
});

test("returns an empty string when sex cannot be determined", () => {
  assert.equal(getPatientSex({}), "");
  assert.equal(getPatientSex({ ageSex: "34 yrs" }), "");
  assert.equal(getPatientSex(), "");
  assert.equal(getPatientSex(null), "");
});
