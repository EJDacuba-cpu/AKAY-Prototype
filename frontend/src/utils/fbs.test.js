import assert from "node:assert/strict";
import test from "node:test";

import { validateFbs } from "./fbs.js";

test("blank FBS is valid (the field is optional)", () => {
  assert.equal(validateFbs(""), "");
  assert.equal(validateFbs("   "), "");
  assert.equal(validateFbs(null), "");
  assert.equal(validateFbs(undefined), "");
});

test("numeric FBS from 0 to 1000 is valid", () => {
  assert.equal(validateFbs("0"), "");
  assert.equal(validateFbs("126"), "");
  assert.equal(validateFbs("99.5"), "");
  assert.equal(validateFbs(1000), "");
});

test("non-numeric, negative or over-1000 FBS is rejected", () => {
  const message = "Enter a valid FBS between 0 and 1000 mg/dL.";
  assert.equal(validateFbs("abc"), message);
  assert.equal(validateFbs("12abc"), message);
  assert.equal(validateFbs("-1"), message);
  assert.equal(validateFbs("1000.1"), message);
  assert.equal(validateFbs("1001"), message);
  assert.equal(validateFbs("Infinity"), message);
  assert.equal(validateFbs("NaN"), message);
});
