import assert from "node:assert/strict";
import test from "node:test";

import { getPatientSex } from "./patientUtils.js";

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
});
